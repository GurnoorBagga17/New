# Team 3 — Identity implementation status

**Current status:** JWT verification and a concrete `IdentityVerifier` are implemented locally. Gate G1 still lacks CIMD fetching, runtime configuration, and integration through the ExtMCP server.  
**Contract version:** `0.1.0-draft`; not frozen.  
**Last updated:** 2026-11-15

## Implemented

- `OidcIdentityVerifier` validates Bearer header syntax and only accepts configured canonical resource URIs.
- Issuers and JWKS endpoints are administrator-configured. The unverified JWT `iss` only selects an exact configured issuer; it never creates a fetch URL.
- `JwtValidator` validates asymmetric signatures with `RS256`, `ES256`, or `EdDSA`, exact issuer, `exp`, optional `nbf`, and exact resource audience. It requires non-empty `sub`, `jti`, and `client_id` claims.
- `JwksCache` requires HTTPS, disables redirects and ambient proxies, limits requests to five seconds and responses to 1 MiB, rejects non-public DNS results, pins resolved addresses, rejects private key material and duplicate/missing key IDs, and fails closed after key expiry.
- Unknown key refreshes are limited to one per issuer per 30 seconds to reduce refresh amplification.
- Auth errors contain no token data; `VerificationRequest` redacts its Authorization header when formatted with `Debug`.
- Local RSA fixture tests cover signature verification, tampering, expiration, `nbf`, issuer/audience binding, malformed headers, missing claims, and SSRF rejection.

Run the identity suite with:

```text
cargo test -p axiom-identity
```

## Remaining for Gate G1

1. **CIMD (if retained in Phase 1).** Add an independently hardened fetch/cache path or explicitly defer CIMD metadata. Current successful identity results always leave `cimd_uri` as `None`; no metadata document is claimed as verified.
2. **Production configuration.** Load issuer/JWKS/resource mappings from a trusted configuration source and define rotation/operational reload behavior.
3. **Full runtime proof.** Exercise the verifier through the live ExtMCP listener and gateway, including JWKS outage, timeout, malformed JWK, key rotation, and redaction cases.
4. **Contract freeze.** Resolve remaining method/error semantics, document runtime compatibility, and remove the `-draft` version only after downstream review.

## Security limits

- The JWKS fetcher has a fixed five-second timeout, but the 15 ms gateway callout budget and sub-5 ms warm verification target have not been benchmarked in the integrated stack.
- The cache refreshes on request after expiry; it does not run a background refresh job or serve stale keys.
- A newly rotated `kid` may be rejected until the 30-second unknown-key refresh throttle expires.
- CIMD fetching is not implemented. A URL-valued `client_id` remains a signed claim only and is not evidence that the metadata URL was fetched or validated.
- Identity component tests pass locally but do not constitute production issuer interoperability or Gate G1 deployment evidence.
