//! Trusted-issuer JWKS fetching and bounded caching.
//!
//! Issuer and JWKS URLs come only from administrator configuration. The token's
//! unverified `iss` claim is used solely to select one of those configured
//! entries; it is never used to construct a network URL.

use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::{Duration, Instant},
};

use jsonwebtoken::jwk::JwkSet;
use thiserror::Error;
use tokio::net::lookup_host;
use url::Url;

const MAX_JWKS_BYTES: usize = 1024 * 1024;
const MAX_DNS_RESULTS: usize = 32;
const FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const UNKNOWN_KID_REFRESH_INTERVAL: Duration = Duration::from_secs(30);

/// A trusted issuer and its explicitly configured signing-key endpoint.
#[derive(Debug, Clone)]
pub struct TrustedIssuer {
    pub issuer: String,
    pub jwks_url: Url,
}

impl TrustedIssuer {
    pub fn new(issuer: impl Into<String>, jwks_url: &str) -> Result<Self, JwksError> {
        let issuer = issuer.into();
        let issuer_url = Url::parse(&issuer).map_err(|_| JwksError::InvalidConfiguration)?;
        if issuer_url.scheme() != "https"
            || issuer_url.host_str().is_none()
            || !issuer_url.username().is_empty()
            || issuer_url.password().is_some()
            || issuer_url.query().is_some()
            || issuer_url.fragment().is_some()
        {
            return Err(JwksError::InvalidConfiguration);
        }

        let jwks_url = Url::parse(jwks_url).map_err(|_| JwksError::InvalidConfiguration)?;
        if jwks_url.scheme() != "https"
            || jwks_url.host_str().is_none()
            || !jwks_url.username().is_empty()
            || jwks_url.password().is_some()
            || jwks_url.fragment().is_some()
            || jwks_url.port_or_known_default() != Some(443)
        {
            return Err(JwksError::InvalidConfiguration);
        }

        Ok(Self { issuer, jwks_url })
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum JwksError {
    #[error("issuer is not configured")]
    UnknownIssuer,
    #[error("trusted issuer configuration is invalid")]
    InvalidConfiguration,
    #[error("JWKS endpoint resolved to a non-public address")]
    SsrfRejection,
    #[error("JWKS request timed out")]
    Timeout,
    #[error("JWKS endpoint is unavailable or returned invalid data")]
    Unavailable,
}

struct CachedSet {
    keys: Arc<JwkSet>,
    loaded_at: Instant,
}

/// Cache for a fixed set of trusted issuer configurations.
///
/// Expired keys are never used as a fallback. Unknown `kid` handling is owned
/// by [`crate::oauth::jwt_validator::JwtValidator`], which can force one refresh.
pub struct JwksCache {
    issuers: HashMap<String, TrustedIssuer>,
    entries: RwLock<HashMap<String, CachedSet>>,
    last_refresh: RwLock<HashMap<String, Instant>>,
    refresh_lock: tokio::sync::Mutex<()>,
    ttl: Duration,
    hits: AtomicU64,
    misses: AtomicU64,
    evictions: AtomicU64,
}

impl JwksCache {
    pub fn new(issuers: Vec<TrustedIssuer>, ttl: Duration) -> Result<Self, JwksError> {
        if ttl.is_zero() || ttl > Duration::from_secs(24 * 60 * 60) || issuers.is_empty() {
            return Err(JwksError::InvalidConfiguration);
        }

        let mut configured = HashMap::with_capacity(issuers.len());
        for issuer in issuers {
            let checked = TrustedIssuer::new(issuer.issuer.clone(), issuer.jwks_url.as_str())?;
            if configured.insert(checked.issuer.clone(), checked).is_some() {
                return Err(JwksError::InvalidConfiguration);
            }
        }

        Ok(Self {
            issuers: configured,
            entries: RwLock::new(HashMap::new()),
            last_refresh: RwLock::new(HashMap::new()),
            refresh_lock: tokio::sync::Mutex::new(()),
            ttl,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
            evictions: AtomicU64::new(0),
        })
    }

    pub async fn get(&self, issuer: &str) -> Result<Arc<JwkSet>, JwksError> {
        if let Some(entry) = self
            .entries
            .read()
            .expect("JWKS cache lock poisoned")
            .get(issuer)
        {
            if entry.loaded_at.elapsed() < self.ttl {
                self.hits.fetch_add(1, Ordering::Relaxed);
                return Ok(Arc::clone(&entry.keys));
            }
        }
        let _guard = self.refresh_lock.lock().await;
        if let Some(entry) = self
            .entries
            .read()
            .expect("JWKS cache lock poisoned")
            .get(issuer)
        {
            if entry.loaded_at.elapsed() < self.ttl {
                self.hits.fetch_add(1, Ordering::Relaxed);
                return Ok(Arc::clone(&entry.keys));
            }
        }
        self.fetch_and_store(issuer).await
    }

    pub async fn refresh(&self, issuer: &str) -> Result<Arc<JwkSet>, JwksError> {
        let _guard = self.refresh_lock.lock().await;
        let recently_refreshed = self
            .last_refresh
            .read()
            .expect("JWKS refresh lock poisoned")
            .get(issuer)
            .is_some_and(|at| at.elapsed() < UNKNOWN_KID_REFRESH_INTERVAL);
        if recently_refreshed {
            if let Some(entry) = self
                .entries
                .read()
                .expect("JWKS cache lock poisoned")
                .get(issuer)
            {
                if entry.loaded_at.elapsed() < self.ttl {
                    return Ok(Arc::clone(&entry.keys));
                }
            }
        }
        self.fetch_and_store(issuer).await
    }

    async fn fetch_and_store(&self, issuer: &str) -> Result<Arc<JwkSet>, JwksError> {
        let trusted = self.issuers.get(issuer).ok_or(JwksError::UnknownIssuer)?;
        self.misses.fetch_add(1, Ordering::Relaxed);
        let bytes = fetch_jwks(&trusted.jwks_url).await?;
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| JwksError::Unavailable)?;
        reject_private_jwk_material(&value)?;
        let keys: JwkSet = serde_json::from_value(value).map_err(|_| JwksError::Unavailable)?;
        if keys.keys.is_empty() || keys.keys.len() > 256 {
            return Err(JwksError::Unavailable);
        }
        let mut key_ids = std::collections::HashSet::new();
        if keys.keys.iter().any(|key| {
            key.common
                .key_id
                .as_deref()
                .is_none_or(|kid| kid.is_empty() || !key_ids.insert(kid.to_owned()))
        }) {
            return Err(JwksError::Unavailable);
        }

        let keys = Arc::new(keys);
        let mut entries = self.entries.write().expect("JWKS cache lock poisoned");
        if entries.remove(issuer).is_some() {
            self.evictions.fetch_add(1, Ordering::Relaxed);
        }
        entries.insert(
            issuer.to_owned(),
            CachedSet {
                keys: Arc::clone(&keys),
                loaded_at: Instant::now(),
            },
        );
        self.last_refresh
            .write()
            .expect("JWKS refresh lock poisoned")
            .insert(issuer.to_owned(), Instant::now());
        Ok(keys)
    }

    pub fn stats(&self) -> (u64, u64, u64) {
        (
            self.hits.load(Ordering::Relaxed),
            self.misses.load(Ordering::Relaxed),
            self.evictions.load(Ordering::Relaxed),
        )
    }

    #[cfg(test)]
    pub(crate) fn seed_for_test(&self, issuer: &str, keys: JwkSet) {
        self.entries
            .write()
            .expect("JWKS cache lock poisoned")
            .insert(
                issuer.to_owned(),
                CachedSet {
                    keys: Arc::new(keys),
                    loaded_at: Instant::now(),
                },
            );
    }
}

async fn fetch_jwks(url: &Url) -> Result<Vec<u8>, JwksError> {
    let host = url.host_str().ok_or(JwksError::InvalidConfiguration)?;
    let port = url
        .port_or_known_default()
        .ok_or(JwksError::InvalidConfiguration)?;
    let addresses = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, port)]
    } else {
        let resolved = tokio::time::timeout(FETCH_TIMEOUT, lookup_host((host, port)))
            .await
            .map_err(|_| JwksError::Timeout)?
            .map_err(|_| JwksError::Unavailable)?;
        resolved.take(MAX_DNS_RESULTS + 1).collect::<Vec<_>>()
    };

    if addresses.is_empty() || addresses.len() > MAX_DNS_RESULTS {
        return Err(JwksError::Unavailable);
    }
    if addresses
        .iter()
        .any(|address| !is_global_unicast(address.ip()))
    {
        return Err(JwksError::SsrfRejection);
    }

    // Pin reqwest to the addresses just checked, disable ambient proxy settings,
    // and reject redirects so a safe hostname cannot redirect to a private host.
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(FETCH_TIMEOUT)
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| JwksError::Unavailable)?;
    let mut response = client.get(url.clone()).send().await.map_err(|error| {
        if error.is_timeout() {
            JwksError::Timeout
        } else {
            JwksError::Unavailable
        }
    })?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length > MAX_JWKS_BYTES as u64)
    {
        return Err(JwksError::Unavailable);
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| JwksError::Unavailable)? {
        if body.len().saturating_add(chunk.len()) > MAX_JWKS_BYTES {
            return Err(JwksError::Unavailable);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn reject_private_jwk_material(value: &serde_json::Value) -> Result<(), JwksError> {
    let keys = value
        .get("keys")
        .and_then(serde_json::Value::as_array)
        .ok_or(JwksError::Unavailable)?;
    for key in keys {
        let key = key.as_object().ok_or(JwksError::Unavailable)?;
        if ["d", "p", "q", "dp", "dq", "qi", "oth", "k"]
            .iter()
            .any(|name| key.contains_key(*name))
        {
            return Err(JwksError::Unavailable);
        }
    }
    Ok(())
}

fn is_global_unicast(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && b == 168)
                || (a == 192 && b == 0)
                || (a == 192 && b == 88 && c == 99)
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113)
                || a >= 224)
        }
        IpAddr::V6(ip) => {
            if ip.to_ipv4_mapped().is_some() {
                return false;
            }
            let segments = ip.segments();
            let global_unicast = (0x2000..=0x3fff).contains(&segments[0]);
            let special_2001 = segments[0] == 0x2001 && segments[1] <= 0x01ff;
            let six_to_four = segments[0] == 0x2002;
            let documentation = (segments[0] == 0x2001 && segments[1] == 0x0db8)
                || (segments[0] == 0x3fff && (segments[1] & 0xfff0) == 0);
            global_unicast
                && !special_2001
                && !six_to_four
                && !documentation
                && !ip.is_unspecified()
                && !ip.is_loopback()
                && !ip.is_multicast()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_issuer_requires_https_and_unambiguous_urls() {
        assert!(
            TrustedIssuer::new("http://issuer.example", "https://issuer.example/jwks").is_err()
        );
        assert!(
            TrustedIssuer::new("https://issuer.example", "http://issuer.example/jwks").is_err()
        );
        assert!(
            TrustedIssuer::new("https://issuer.example", "https://user@issuer.example/jwks")
                .is_err()
        );
        assert!(
            TrustedIssuer::new("https://issuer.example", "https://issuer.example/jwks").is_ok()
        );
    }

    #[test]
    fn rejects_non_global_addresses() {
        for address in [
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "192.0.2.1",
            "198.51.100.2",
            "203.0.113.4",
            "224.0.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "2002::1",
            "ff02::1",
        ] {
            assert!(!is_global_unicast(address.parse().unwrap()), "{address}");
        }
        assert!(is_global_unicast("8.8.8.8".parse().unwrap()));
        assert!(is_global_unicast("2606:4700:4700::1111".parse().unwrap()));
    }

    #[tokio::test]
    async fn refuses_localhost_jwks_before_connecting() {
        let issuer = TrustedIssuer::new(
            "https://issuer.example",
            "https://localhost/.well-known/jwks.json",
        )
        .unwrap();
        let cache = JwksCache::new(vec![issuer], Duration::from_secs(60)).unwrap();
        assert_eq!(
            cache.get("https://issuer.example").await.unwrap_err(),
            JwksError::SsrfRejection
        );
    }

    #[test]
    fn rejects_symmetric_private_jwk_material() {
        let jwks = serde_json::json!({"keys": [{"kty":"oct", "kid":"k", "k":"secret"}]});
        assert_eq!(
            reject_private_jwk_material(&jwks),
            Err(JwksError::Unavailable)
        );
    }
}
