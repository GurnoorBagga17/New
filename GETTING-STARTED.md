# Axiom NHI - Getting Started Guide

**Welcome to Axiom NHI!** This guide will help you set up your local development environment and start building the full product.

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** ([download](https://nodejs.org))
- **Rust 1.75+** ([install](https://rustup.rs))
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/)) - for PostgreSQL, Redis
- **Git** (for version control)

### 1. Install Dependencies

```powershell
# Install pnpm (fast package manager)
npm install -g pnpm@9.15.4

# Install project dependencies
pnpm install

# Build Rust workspace
cargo build --workspace
```

### 2. Start Infrastructure Services

```powershell
# Start PostgreSQL, Redis, and other services
docker compose up -d

# Verify services are running
docker compose ps
```

Expected output:
```
NAME                STATUS
axiom-postgres      Up (healthy)
axiom-redis         Up (healthy)
axiom-openbao       Up (healthy)
```

### 3. Set Up Database

```powershell
# Run the setup script (Windows)
.\scripts\setup-dev.ps1

# Or manually:
# Create databases
docker compose exec postgres psql -U axiom -c "CREATE DATABASE axiom_test;"

# Apply migrations
psql postgresql://axiom:axiom_dev_password@localhost:5432/axiom_dev < migrations/0001_tenants_and_operators.sql
psql postgresql://axiom:axiom_dev_password@localhost:5432/axiom_dev < migrations/0002_billing_and_entitlements.sql
psql postgresql://axiom:axiom_dev_password@localhost:5432/axiom_dev < migrations/0003_integrations_and_connectors.sql
```

### 4. Start Development Server

```powershell
# Start all services (Next.js, Rust backend, etc.)
pnpm dev
```

This will start:
- **Next.js Web App**: http://localhost:3000
- **Rust Admin API**: http://localhost:8787 (if configured)
- **Gateway UI**: http://localhost:3001 (if configured)

### 5. Access the Application

Open your browser to:
- **Main App**: http://localhost:3000
- **PgAdmin** (optional): http://localhost:5050
- **Redis Commander** (optional): http://localhost:8081

---

## 📁 Project Structure

```
Axiom/
├── apps/
│   ├── web/              # Next.js public web app (landing, playground, docs)
│   ├── console/          # Enterprise control plane console (Phase 2-4)
│   └── gateway-ui/       # Gateway admin UI
├── services/
│   └── extmcp/           # Rust MCP gateway and policy runtime
├── connectors/           # Discovery connectors (AWS, GitHub, etc.)
├── identity/             # JWT verification, OIDC, OAuth
├── validators/           # SQL AST, egress, tool pinning validators
├── lineage-graph/        # Identity relationship graph
├── risk-engine/          # Risk scoring (OWASP NHI Top 10)
├── migrations/           # Database schema migrations
├── tests/                # Integration, security, and E2E tests
└── deployments/          # Helm charts, Kubernetes manifests
```

---

## 🔐 Environment Configuration

### Development (.env.local)

The setup script creates `.env.local` with safe defaults:

```bash
NODE_ENV=development
AXIOM_DEV_MODE=1
AXIOM_ALLOW_ANONYMOUS_LOCAL=1

DATABASE_URL=postgresql://axiom:axiom_dev_password@localhost:5432/axiom_dev
AXIOM_ADMIN_API_URL=http://127.0.0.1:8787
AXIOM_ADMIN_TOKEN=axm_local_dev_token_for_browser_testing
```

### Adding Stripe (Optional)

For billing features:

1. Create a Stripe account (test mode): https://dashboard.stripe.com/register
2. Get API keys: Dashboard → Developers → API keys
3. Add to `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

4. Test webhooks locally:

```powershell
# Install Stripe CLI
scoop install stripe

# Forward webhooks
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

---

## 🧪 Running Tests

### Unit Tests

```powershell
# Run all unit tests
pnpm test

# Run Rust tests
cargo test --workspace

# Run specific test file
pnpm test tests/security/tenant-isolation.test.ts
```

### Security Tests

```powershell
# Run tenant isolation tests
cd tests
npm install
node security/tenant-isolation.test.ts
```

### E2E Tests

```powershell
# Run full Python test suite
python tests/run_tests.py

# Run specific test category
python tests/run_tests.py --filter integration
```

---

## 🏗️ Development Workflow

### 1. Start Services

```powershell
# Terminal 1: Infrastructure
docker compose up

# Terminal 2: Development servers
pnpm dev

# Terminal 3: Watch tests
pnpm test --watch
```

### 2. Make Changes

- **Frontend**: Edit files in `apps/web/app/`
- **API Routes**: Edit files in `apps/web/app/api/`
- **Rust Backend**: Edit files in `services/extmcp/` or `connectors/`

Changes are hot-reloaded automatically.

### 3. Verify Changes

```powershell
# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

### 4. Run Security Tests

```powershell
# Before committing
pnpm test tests/security/
```

---

## 📊 Available Services

### Core Services (Always Running)

| Service | URL | Credentials |
|---------|-----|-------------|
| Next.js Web | http://localhost:3000 | N/A |
| PostgreSQL | localhost:5432 | axiom / axiom_dev_password |
| Redis | localhost:6379 | No password |

### Optional Tools (--profile tools)

Start with: `docker compose --profile tools up -d`

| Service | URL | Credentials |
|---------|-----|-------------|
| PgAdmin | http://localhost:5050 | admin@axiom.local / admin |
| Redis Commander | http://localhost:8081 | N/A |
| Mailhog (SMTP) | http://localhost:8025 | N/A |

---

## 🔧 Common Tasks

### Reset Database

```powershell
# Drop and recreate
docker compose down -v
docker compose up -d postgres
.\scripts\setup-dev.ps1 -SkipDependencies
```

### Add New Migration

```sql
-- migrations/0004_my_new_feature.sql
-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0

CREATE TABLE my_new_table (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON my_new_table
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);
```

Then apply:
```powershell
psql $env:DATABASE_URL < migrations/0004_my_new_feature.sql
```

### Debug Rust Backend

```powershell
# Build with debug symbols
cargo build

# Run with logging
RUST_LOG=debug cargo run

# Or with IDE debugger
code . # VS Code
# Press F5 to start debugging
```

### View Logs

```powershell
# Docker services
docker compose logs -f

# Specific service
docker compose logs -f postgres

# Next.js (in terminal running pnpm dev)
# Ctrl+C to stop and view all logs
```

---

## 🚦 Development Phases

Follow the implementation roadmap in `IMPLEMENTATION-CHECKLIST.md`:

### ✅ Phase 0: Foundation (Completed)
- [x] Remove mock fallbacks
- [x] Database migrations
- [x] Docker Compose setup
- [x] Environment configuration

### 🔄 Phase 1: Secure Identity (In Progress)
- [x] CSRF middleware
- [x] TOTP/MFA enrollment
- [ ] WebAuthn support
- [ ] Session management UI

### ⏳ Phase 2: Billing (Next)
- [x] Stripe checkout route
- [x] Webhook handler
- [ ] Stripe account setup
- [ ] Billing dashboard UI

### ⏳ Phase 3: Integrations
- [ ] AWS IAM connector
- [ ] GitHub App connector
- [ ] Job queue worker

### ⏳ Phase 4: Runtime
- [ ] Enrollment API
- [ ] Policy signing
- [ ] Helm chart fixes

---

## 🆘 Troubleshooting

### "pnpm install" fails

```powershell
# Clear cache and retry
pnpm store prune
rm -rf node_modules
pnpm install
```

### "cargo build" fails

```powershell
# Update Rust toolchain
rustup update

# Clean and rebuild
cargo clean
cargo build
```

### Database connection fails

```powershell
# Check if PostgreSQL is running
docker compose ps postgres

# Restart PostgreSQL
docker compose restart postgres

# Check logs
docker compose logs postgres
```

### Port already in use

```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (replace PID)
taskkill /PID <PID> /F

# Or change port in .env.local
PORT=3001 pnpm dev
```

### CSRF errors in development

If you see "CSRF token required" errors:

1. Check that `.env.local` has `AXIOM_DEV_MODE=1`
2. Or send `X-CSRF-Token` header in requests
3. Get token from `/api/auth/me` response

---

## 📚 Additional Resources

- **Architecture Document**: `AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md`
- **Gap Analysis**: `docs/architecture/IMPLEMENTATION-GAP-ANALYSIS.md`
- **Implementation Checklist**: `IMPLEMENTATION-CHECKLIST.md`
- **Review Summary**: `REVIEW-SUMMARY.md`

### Documentation Links

- Next.js: https://nextjs.org/docs
- React: https://react.dev
- Rust: https://doc.rust-lang.org/book/
- PostgreSQL: https://www.postgresql.org/docs/
- Stripe: https://stripe.com/docs/api

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes with tests
3. Run security tests: `pnpm test tests/security/`
4. Commit: `git commit -m "feat: add my feature"`
5. Push and create PR

### Commit Message Convention

```
feat: add user authentication
fix: resolve CSRF validation bug
docs: update getting started guide
test: add tenant isolation tests
chore: upgrade dependencies
```

---

## 📞 Support

- **Issues**: Create a GitHub issue
- **Questions**: Contact engineering team
- **Security**: security@axiom.io

---

**Ready to start building?** Run `pnpm dev` and visit http://localhost:3000

**Need help?** Check the troubleshooting section or review the architecture docs.

**Want to contribute?** See the contributing section and implementation checklist!
