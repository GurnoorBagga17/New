//! HTTPS egress URL validation with a host allowlist and DNS address checks.

use std::{collections::BTreeSet, net::{IpAddr, SocketAddr}};

use tokio::net::lookup_host;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EgressFacts {
    pub domain: Option<String>,
    pub is_private_ip: bool,
    pub passed: bool,
    pub violation_code: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct EgressValidator {
    allowed_hosts: BTreeSet<String>,
}

impl EgressValidator {
    pub fn new<I, S>(allowed_hosts: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            allowed_hosts: allowed_hosts
                .into_iter()
                .map(|host| host.into().trim_end_matches('.').to_ascii_lowercase())
                .collect(),
        }
    }

    pub async fn validate(&self, input: &str) -> EgressFacts {
        let Ok(url) = Url::parse(input) else {
            return failed(None, false, "INVALID_EGRESS_URL");
        };
        if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
            return failed(
                url.host_str().map(str::to_owned),
                false,
                "EGRESS_SCHEME_OR_CREDENTIALS",
            );
        }
        if url.port().is_some_and(|port| port != 443) {
            return failed(
                url.host_str().map(str::to_owned),
                false,
                "EGRESS_PORT_NOT_ALLOWED",
            );
        }
        let Some(host) = url.host_str() else {
            return failed(None, false, "EGRESS_HOST_MISSING");
        };
        let normalized = host.trim_end_matches('.').to_ascii_lowercase();
        if !self.host_is_allowed(&normalized) {
            return failed(Some(normalized), false, "EGRESS_HOST_NOT_ALLOWED");
        }

        let port = url.port().unwrap_or(443);
        let addresses: Vec<IpAddr> = match normalized.parse::<IpAddr>() {
            Ok(address) => vec![address],
            Err(_) => match lookup_host((normalized.as_str(), port)).await {
                Ok(results) => results.map(|entry| entry.ip()).collect(),
                Err(_) => return failed(Some(normalized.clone()), false, "EGRESS_DNS_FAILURE"),
            },
        };
        if addresses.is_empty() {
            return failed(Some(normalized), false, "EGRESS_DNS_EMPTY");
        }
        let private = addresses.iter().any(|address| !is_public_unicast(*address));
        if private {
            return failed(Some(normalized), true, "EGRESS_NON_PUBLIC_ADDRESS");
        }
        EgressFacts {
            domain: Some(normalized),
            is_private_ip: false,
            passed: true,
            violation_code: None,
        }
    }

    fn host_is_allowed(&self, host: &str) -> bool {
        self.allowed_hosts.iter().any(|allowed| {
            host == allowed
                || host
                    .strip_suffix(allowed)
                    .is_some_and(|prefix| prefix.ends_with('.') && prefix.len() > 1)
        })
    }
}

fn failed(domain: Option<String>, private: bool, code: &str) -> EgressFacts {
    EgressFacts {
        domain,
        is_private_ip: private,
        passed: false,
        violation_code: Some(code.to_owned()),
    }
}

/// Conservatively accept only globally routable unicast addresses.
fn is_public_unicast(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, d] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && b == 168)
                || (a == 192 && b == 0 && (c == 0 || c == 2))
                || (a == 192 && b == 88 && c == 99)
                || (a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                || (a == 203 && b == 0 && c == 113)
                || a >= 224
                || (a == 255 && b == 255 && c == 255 && d == 255))
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return is_public_unicast(IpAddr::V4(v4));
            }
            let segments = ip.segments();
            let global_unicast_space = (0x2000..=0x3fff).contains(&segments[0]);
            let documentation = segments[0] == 0x2001 && segments[1] == 0x0db8
                || segments[0] == 0x3fff && (segments[1] & 0xfff0) == 0x0000;
            !ip.is_unspecified()
                && !ip.is_loopback()
                && !ip.is_multicast()
                && global_unicast_space
                && !documentation
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_allowlist_uses_label_boundaries() {
        let validator = EgressValidator::new(["example.com"]);
        assert!(validator.host_is_allowed("api.example.com"));
        assert!(validator.host_is_allowed("example.com"));
        assert!(!validator.host_is_allowed("notexample.com"));
    }

    #[test]
    fn non_global_ip_ranges_are_rejected() {
        for ip in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "192.0.2.1",
            "::1",
            "fc00::1",
            "2001:db8::1",
            "ff02::1",
        ] {
            assert!(!is_public_unicast(ip.parse().unwrap()), "{ip}");
        }
        assert!(is_public_unicast("8.8.8.8".parse().unwrap()));
        assert!(is_public_unicast("2001:4860:4860::8888".parse().unwrap()));
    }

    #[tokio::test]
    async fn rejects_non_https_credentials_and_disallowed_ports() {
        let validator = EgressValidator::new(["example.com"]);
        assert!(!validator.validate("http://example.com").await.passed);
        assert!(!validator.validate("https://user@example.com").await.passed);
        assert!(!validator.validate("https://example.com:8443").await.passed);
    }

    #[tokio::test]
    async fn rejects_a_host_that_resolves_to_loopback() {
        let validator = EgressValidator::new(["localhost"]);
        let facts = validator.validate("https://localhost").await;
        assert!(!facts.passed);
        assert!(facts.is_private_ip);
    }
}

/// Validated, DNS-pinned outbound connection target (AX-013).
/// Binds the TLS SNI hostname to the exact public `SocketAddr` list validated
/// at policy time so the socket connector never re-resolves DNS (preventing DNS rebinding TOCTOU).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedEgressConnectTarget {
    pub sni_hostname: String,
    pub port: u16,
    pub pinned_addrs: Vec<SocketAddr>,
}

impl EgressValidator {
    /// Resolves DNS once, validates that all returned addresses are public unicast IPs,
    /// and returns a `PinnedEgressConnectTarget` for direct socket dialing without re-lookup.
    pub async fn validate_and_pin(&self, input: &str) -> Result<PinnedEgressConnectTarget, EgressFacts> {
        let Ok(url) = Url::parse(input) else {
            return Err(failed(None, false, "INVALID_EGRESS_URL"));
        };
        if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
            return Err(failed(
                url.host_str().map(str::to_owned),
                false,
                "EGRESS_SCHEME_OR_CREDENTIALS",
            ));
        }
        let port = url.port().unwrap_or(443);
        if port != 443 {
            return Err(failed(
                url.host_str().map(str::to_owned),
                false,
                "EGRESS_PORT_NOT_ALLOWED",
            ));
        }
        let Some(host) = url.host_str() else {
            return Err(failed(None, false, "EGRESS_HOST_MISSING"));
        };
        let normalized = host.trim_end_matches('.').to_ascii_lowercase();
        if !self.host_is_allowed(&normalized) {
            return Err(failed(Some(normalized), false, "EGRESS_HOST_NOT_ALLOWED"));
        }

        let pinned_addrs: Vec<SocketAddr> = match normalized.parse::<IpAddr>() {
            Ok(ip) => vec![SocketAddr::new(ip, port)],
            Err(_) => match lookup_host((normalized.as_str(), port)).await {
                Ok(results) => results.collect(),
                Err(_) => return Err(failed(Some(normalized), false, "EGRESS_DNS_FAILURE")),
            },
        };
        if pinned_addrs.is_empty() {
            return Err(failed(Some(normalized), false, "EGRESS_DNS_EMPTY"));
        }
        if pinned_addrs.iter().any(|sa| !is_public_unicast(sa.ip())) {
            return Err(failed(Some(normalized), true, "EGRESS_NON_PUBLIC_ADDRESS"));
        }

        Ok(PinnedEgressConnectTarget {
            sni_hostname: normalized,
            port,
            pinned_addrs,
        })
    }
}
