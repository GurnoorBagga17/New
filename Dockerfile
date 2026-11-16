# syntax=docker/dockerfile:1.7
# Multi-stage reproducible production build for Axiom NHI Unified Runtime & Console

FROM rust:1.85-slim-bookworm AS rust-builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends protobuf-compiler pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY proto ./proto
COPY identity ./identity
COPY validators ./validators
COPY observability ./observability
COPY services ./services
COPY connectors ./connectors
COPY attribution ./attribution
COPY lineage-graph ./lineage-graph
COPY risk-engine ./risk-engine
COPY alerts ./alerts
COPY secretless ./secretless
COPY approvals ./approvals
COPY siem-soar ./siem-soar
COPY fleet-control ./fleet-control
RUN cargo build --release --workspace

FROM node:22-bookworm-slim AS web-builder
WORKDIR /web
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json tokens.json ./
COPY packages ./packages
COPY apps/gateway-ui ./apps/gateway-ui
RUN pnpm install --frozen-lockfile && pnpm --filter @axiom/cedar-editor build && pnpm --filter @axiom/gateway-ui build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN groupadd -g 65532 axiom && useradd -u 65532 -g 65532 -s /usr/sbin/nologin -M axiom
COPY --from=rust-builder /build/target/release/axiom-extmcp-runtime /usr/local/bin/axiom-extmcp-runtime
COPY --from=web-builder /web/apps/gateway-ui/dist /app/apps/gateway-ui/dist
COPY gateway/local-admin-api /app/gateway/local-admin-api
COPY gateway/mcp-interceptor /app/gateway/mcp-interceptor
ENV NODE_ENV=production
ENV PORT=8080
ENV AXIOM_ALLOWED_ORIGINS=http://localhost:8080
USER 65532:65532
EXPOSE 8080 9001
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "/app/gateway/local-admin-api/server.cjs"]
