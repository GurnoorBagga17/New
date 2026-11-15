// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Concurrent TTL-bounded cache for Client ID Metadata Documents (CIMD).
//!
//! Enforces strict memory bounds and TTL eviction (default 1 hour) while
//! keeping hot-path lookups lock-free or sub-microsecond.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use super::CimdDocument;

#[derive(Clone, Debug)]
struct CachedEntry {
    document: CimdDocument,
    inserted_at: Instant,
    ttl: Duration,
}

impl CachedEntry {
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() >= self.ttl
    }
}

/// Thread-safe TTL cache for verified CIMD documents.
pub struct CimdCache {
    entries: RwLock<HashMap<String, CachedEntry>>,
    default_ttl: Duration,
    max_entries: usize,
}

impl CimdCache {
    pub fn new(default_ttl: Duration, max_entries: usize) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            default_ttl,
            max_entries: max_entries.max(16),
        }
    }

    pub fn get(&self, client_id_uri: &str) -> Option<CimdDocument> {
        let guard = self.entries.read().ok()?;
        let entry = guard.get(client_id_uri)?;
        if entry.is_expired() {
            drop(guard);
            if let Ok(mut write_guard) = self.entries.write() {
                write_guard.remove(client_id_uri);
            }
            return None;
        }
        Some(entry.document.clone())
    }

    pub fn insert(&self, client_id_uri: String, document: CimdDocument) {
        self.insert_with_ttl(client_id_uri, document, self.default_ttl);
    }

    pub fn insert_with_ttl(&self, client_id_uri: String, document: CimdDocument, ttl: Duration) {
        if let Ok(mut guard) = self.entries.write() {
            if guard.len() >= self.max_entries && !guard.contains_key(&client_id_uri) {
                // Evict expired entries first; if still full, evict oldest
                guard.retain(|_, v| !v.is_expired());
                if guard.len() >= self.max_entries {
                    if let Some(oldest_key) = guard
                        .iter()
                        .min_by_key(|(_, v)| v.inserted_at)
                        .map(|(k, _)| k.clone())
                    {
                        guard.remove(&oldest_key);
                    }
                }
            }
            guard.insert(
                client_id_uri,
                CachedEntry {
                    document,
                    inserted_at: Instant::now(),
                    ttl,
                },
            );
        }
    }

    pub fn len(&self) -> usize {
        self.entries.read().map(|g| g.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}
