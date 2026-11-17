# Axiom NHI — Developer Onboarding & Contribution Guide

**Document:** `docs/architecture/complete-audit/DEVELOPER_ONBOARDING.md`  
**Classification:** New Engineer Onboarding, Extension Guide & Pull Request Checklist  
**Target Audience:** New Backend Engineers, Frontend Engineers, Cloud Security Contributors  

---

## 1. Mental Model: The Polyglot Monorepo

To be productive in Axiom NHI, remember **one foundational rule**:
> **Axiom has two halves: a Cloud Control Plane (`apps/web`) and an Inline Rust Runtime (`services/extmcp/runtime`).**

- **Frontend (`apps/web`):** Handles UI rendering, user authentication, customer onboarding, and proxies dry-run evaluations to the local Rust runtime.
- **Backend (`services/extmcp/runtime`):** Owns the gRPC server (:9001) that intercepts live MCP traffic, the Cedar policy engine, AST validators, and the Axum HTTP admin server (:8787).
- **Crater Architecture:** Business logic is divided into 18 specialized Rust crates (`identity`, `validators`, `lineage-graph`, `secretless`, etc.). When adding a feature, locate the specific crate rather than bloating `services/extmcp/runtime`.

---

## 2. Setting Up Your Development Environment

### 2.1 Toolchain Requirements
1. **Rust (stable):** `rustup update stable` (version 1.80.0 or higher).
2. **Node.js:** `node -v` (version 20.0.0 or higher).
3. **pnpm:** `pnpm -v` (version 9.0.0 or higher). If missing, run `npm install -g pnpm`.
4. **Git:** Configured with your corporate email.

### 2.2 First-Time Repository Initialization
```bash
# Clone the repository
git clone https://github.com/GurnoorBagga17/New.git Axiom
cd Axiom

# Install JavaScript/TypeScript dependencies
pnpm install

# Verify all 18 Rust workspace crates compile cleanly
cargo check --workspace
```

---

## 3. The Daily Local Development Loop

### 3.1 Terminal 1: Start the Rust ExtMCP Runtime
```bash
# Set offline development environment flags
export AXIOM_DEV_MODE=1
export AXIOM_ALLOW_ANONYMOUS_LOCAL=1
export AXIOM_IDENTITY_CONFIG=deployments/local/identity.json
export AXIOM_RESOURCE_MAP_CONFIG=deployments/local/resources.json
export AXIOM_VALIDATION_CONFIG=deployments/local/validation.json
export AXIOM_REVOCATION_CONFIG=deployments/local/revocations.json
export AXIOM_ADMIN_TOKEN="0123456789abcdef0123456789abcdef"
export AXIOM_DATA_DIR="./data/axiom-dev"

# Run with debug logging enabled
RUST_LOG=info,extmcp_runtime=debug cargo run -p extmcp-runtime
```
*Expected Output:*
```text
Axiom NHI ExtMCP gRPC runtime listening on 0.0.0.0:9001
Axiom local Rust admin & control plane API listening on 127.0.0.1:8787
```

### 3.2 Terminal 2: Start the Next.js Web App
```bash
pnpm --filter @axiom/web dev
```
*Access in your browser:*
- Public Landing Page: `http://localhost:3000`
- Interactive Attack Playground: `http://localhost:3000/playground`
- Security Operator Console: `http://localhost:3000/console`

---

## 4. How to Extend the Platform

### 4.1 How to Add a New AST Threat Validator Check
1. Open `validators/src/sql.rs` (or `filesystem.rs` / `egress.rs`).
2. Add your AST pattern match:
   ```rust
   // Example: Detect unauthorized GRANT statements in SQL AST
   if let Statement::Grant { .. } = statement {
       return Err(ValidationError::PrivilegeEscalation("GRANT statements are forbidden".into()));
   }
   ```
3. Add a unit test in `validators/src/sql.rs` under `#[cfg(test)]`.
4. Run `cargo test -p axiom-validators` to verify.

### 4.2 How to Add a New Cedar Policy Rule
1. Open `services/extmcp/cedar/src/schema.rs`.
2. Add the rule to `DEFAULT_POLICY_BUNDLE`:
   ```cedar
   // Forbid any file write to root directory
   forbid (
     principal,
     action == Axiom::Action::"write_file",
     resource
   ) when {
     context.normalized_path like "/*" && !(context.normalized_path like "/tmp/*")
   };
   ```
3. Run `cargo test -p extmcp-cedar` to verify strict schema validation passes.

### 4.3 How to Add a New Frontend Page
1. Create a directory in `apps/web/app/<route-name>/`.
2. Add `page.tsx` wrapped in `<SiteShell>`:
   ```tsx
   import { SiteShell } from "../components/SiteShell";

   export default function MyNewPage() {
     return (
       <SiteShell>
         <main className="min-h-screen bg-[var(--bg-primary)] px-6 py-16">
           <h1 className="text-3xl font-bold text-[var(--text-primary)]">New Feature</h1>
         </main>
       </SiteShell>
     );
   }
   ```
3. Verify zero `#hex` colors are used (use `var(--text-primary)`, `var(--bg-secondary)`, etc.).

---

## 5. Pre-Pull Request Verification Checklist

Before opening any Pull Request, you **MUST** run and pass the following 4 verification steps:

```bash
# 1. Rust workspace check (0 errors)
cargo check --workspace

# 2. Rust unit tests (all passing)
cargo test --workspace

# 3. TypeScript type check (0 errors)
pnpm --filter @axiom/web typecheck

# 4. Next.js production build check
pnpm --filter @axiom/web build
```
If all 4 steps exit with code 0, your pull request is safe to merge!
