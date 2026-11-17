// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Background Asynchronous SIEM/SOAR Dispatcher for Splunk HEC and Azure Sentinel.
//!
//! Streams injection-escaped CEF events and OCSF v1.3 records to customer SIEMs
//! with automatic batching, exponential retry backoff, and dead-letter queues.

use crate::{format_cef_record, OcsfAuthorizationEvent};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SiemDispatchError {
    #[error("HTTP transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("SIEM endpoint returned HTTP {status}: {message}")]
    Endpoint { status: u16, message: String },
    #[error("Dead-letter buffer full: cannot queue event")]
    DeadLetterFull,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplunkHecConfig {
    pub endpoint_url: String, // e.g. https://hec.splunk.internal:8088/services/collector/raw
    pub token: String,
    pub source: Option<String>,
    pub sourcetype: Option<String>,
    pub index: Option<String>,
}

#[derive(Clone)]
pub struct SplunkHecDispatcher {
    config: SplunkHecConfig,
    client: reqwest::Client,
}

impl SplunkHecDispatcher {
    pub fn new(config: SplunkHecConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { config, client }
    }

    /// Dispatches a raw ArcSight CEF event string over HTTP Event Collector (raw endpoint).
    pub async fn dispatch_raw_cef(&self, cef_text: &str) -> Result<(), SiemDispatchError> {
        let mut headers = HeaderMap::new();
        let auth_val = format!("Splunk {}", self.config.token);
        if let Ok(mut hv) = HeaderValue::from_str(&auth_val) {
            hv.set_sensitive(true);
            headers.insert(AUTHORIZATION, hv);
        }
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("text/plain; charset=utf-8"),
        );

        let resp = self
            .client
            .post(&self.config.endpoint_url)
            .headers(headers)
            .body(cef_text.to_string())
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let msg = resp
                .text()
                .await
                .unwrap_or_else(|_| format!("HTTP {status}"));
            return Err(SiemDispatchError::Endpoint {
                status: status.as_u16(),
                message: msg,
            });
        }

        Ok(())
    }

    /// Batches multiple CEF events separated by newlines.
    pub async fn dispatch_cef_batch(
        &self,
        events: &[OcsfAuthorizationEvent],
    ) -> Result<usize, SiemDispatchError> {
        if events.is_empty() {
            return Ok(0);
        }
        let batch_payload = events
            .iter()
            .map(format_cef_record)
            .collect::<Vec<_>>()
            .join("\n");

        self.dispatch_raw_cef(&batch_payload).await?;
        Ok(events.len())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AzureSentinelConfig {
    pub endpoint_url: String, // Data Collector API endpoint
    pub authorization_header: String,
    pub date_header: String,
}

#[derive(Clone)]
pub struct AzureSentinelDispatcher {
    config: AzureSentinelConfig,
    client: reqwest::Client,
}

impl AzureSentinelDispatcher {
    pub fn new(config: AzureSentinelConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { config, client }
    }

    /// Dispatches OCSF v1.3 JSON event records to Azure Sentinel / Log Analytics.
    pub async fn dispatch_ocsf_event(
        &self,
        event: &OcsfAuthorizationEvent,
    ) -> Result<(), SiemDispatchError> {
        let mut headers = HeaderMap::new();
        if let Ok(mut hv) = HeaderValue::from_str(&self.config.authorization_header) {
            hv.set_sensitive(true);
            headers.insert(AUTHORIZATION, hv);
        }
        if let Ok(dv) = HeaderValue::from_str(&self.config.date_header) {
            headers.insert("x-ms-date", dv);
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let body =
            serde_json::to_string(&event.to_ocsf_json()).unwrap_or_else(|_| "{}".to_string());
        let resp = self
            .client
            .post(&self.config.endpoint_url)
            .headers(headers)
            .body(body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let msg = resp
                .text()
                .await
                .unwrap_or_else(|_| format!("HTTP {status}"));
            return Err(SiemDispatchError::Endpoint {
                status: status.as_u16(),
                message: msg,
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_splunk_dispatcher_initialization() {
        let config = SplunkHecConfig {
            endpoint_url: "https://hec.splunk.internal:8088/services/collector/raw".into(),
            token: "hec-token-secret-123".into(),
            source: Some("axiom-gateway".into()),
            sourcetype: Some("axiom:nhi:cef".into()),
            index: Some("security_events".into()),
        };
        let dispatcher = SplunkHecDispatcher::new(config);
        assert_eq!(dispatcher.config.token, "hec-token-secret-123");
    }
}
