//! Structured argument validation for Axiom NHI.
//!
//! Validators produce facts and reject inputs they cannot safely classify.
//! They do not grant permissions. Filesystem and egress facts are only useful
//! when the eventual tool execution uses the same confined root and pinned
//! network address; validation alone cannot eliminate TOCTOU or DNS rebinding.

mod adapter;
pub mod egress;
pub mod filesystem;
pub mod sql;
pub mod tool_pin;

pub use adapter::{AxiomArgumentValidator, ToolValidationProfile};

use serde::{Deserialize, Serialize};

/// Normalized result for validators that do not map directly to Cedar facts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationFinding {
    pub validator_id: String,
    pub passed: bool,
    pub violation_code: Option<String>,
    pub reason: Option<String>,
}
