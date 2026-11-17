// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import type { NextRequest } from "next/server";

export type OperatorRole =
  | "security-admin"
  | "soc-operator"
  | "platform-engineer"
  | "auditor"
  | "operator";

export interface TenantUserRecord {
  readonly userId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly passwordSaltHex: string;
  readonly passwordHashHex: string;
  readonly role: OperatorRole;
  readonly mfaEnabled: boolean;
  readonly webauthnCredentialId?: string;
  readonly createdAtIso: string;
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly role: OperatorRole;
  readonly csrfToken: string;
  readonly expiresAtUnix: number;
}

const DATA_DIR = process.env.AXIOM_DATA_DIR || path.resolve(process.cwd(), "../../data/axiom");
const STORE_FILE = path.join(DATA_DIR, "web_auth_store.json");

const usersByEmail = new Map<string, TenantUserRecord>();
const sessionsById = new Map<string, SessionRecord>();

// PostgreSQL Connection Pool for Phase 1 Enterprise Auth
let dbPool: pg.Pool | null = null;
if (process.env.DATABASE_URL) {
  try {
    dbPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  } catch (err) {
    console.warn("PostgreSQL pool initialization failed; falling back to local file store", err);
  }
}

// Initialize persistent disk backing for local dev & evaluation
function loadPersistedStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users)) {
        for (const u of parsed.users) {
          if (u && typeof u.email === "string") {
            usersByEmail.set(u.email.toLowerCase(), u);
          }
        }
      }
      if (Array.isArray(parsed.sessions)) {
        const now = Math.floor(Date.now() / 1000);
        for (const s of parsed.sessions) {
          if (s && typeof s.sessionId === "string" && s.expiresAtUnix > now) {
            sessionsById.set(s.sessionId, s);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not load persisted auth store from disk; using in-memory store", err);
  }
}

export function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = {
      users: Array.from(usersByEmail.values()),
      sessions: Array.from(sessionsById.values()),
      updatedAtIso: new Date().toISOString(),
    };
    const tmp = `${STORE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error("Failed to persist web auth store to disk:", err);
  }
}

// Load existing local data immediately
loadPersistedStore();

export function hashPasswordScrypt(password: string, saltHex?: string): { saltHex: string; hashHex: string } {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return {
    saltHex: salt.toString("hex"),
    hashHex: derived.toString("hex"),
  };
}

export function verifyPasswordScrypt(password: string, saltHex: string, expectedHashHex: string): boolean {
  const { hashHex } = hashPasswordScrypt(password, saltHex);
  const actualBuf = Buffer.from(hashHex, "hex");
  const expectedBuf = Buffer.from(expectedHashHex, "hex");
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

// Synchronous session creation (in-memory + disk cache + async DB mirror)
export function createSession(user: TenantUserRecord): SessionRecord {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 3600 * 8;
  const session: SessionRecord = {
    sessionId,
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    csrfToken,
    expiresAtUnix,
  };
  sessionsById.set(sessionId, session);
  persistStore();

  // Async mirror to PostgreSQL if available
  if (dbPool) {
    dbPool
      .query(
        `INSERT INTO operator_sessions (session_id, user_id, tenant_id, csrf_token, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5))
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId, user.userId, user.tenantId, csrfToken, expiresAtUnix]
      )
      .catch((err) => console.warn("Failed to mirror session to PostgreSQL:", err.message));
  }

  return session;
}

export function getSession(sessionId: string): SessionRecord | null {
  const session = sessionsById.get(sessionId);
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAtUnix <= now) {
    sessionsById.delete(sessionId);
    persistStore();
    return null;
  }
  return session;
}

export function deleteSession(sessionId: string): boolean {
  const existed = sessionsById.delete(sessionId);
  if (existed) persistStore();
  if (dbPool) {
    dbPool
      .query("UPDATE operator_sessions SET revoked = TRUE WHERE session_id = $1", [sessionId])
      .catch((err) => console.warn("Failed to mark session revoked in PostgreSQL:", err.message));
  }
  return existed;
}

export function getUserById(userId: string): TenantUserRecord | null {
  for (const user of usersByEmail.values()) {
    if (user.userId === userId) return user;
  }
  return null;
}

export function saveUser(user: TenantUserRecord): void {
  usersByEmail.set(user.email.toLowerCase(), user);
  persistStore();

  // Async mirror to PostgreSQL if available
  if (dbPool) {
    const passwordComposite = `scrypt$${user.passwordSaltHex}$${user.passwordHashHex}`;
    const roleDb = user.role === "operator" ? "soc-operator" : user.role;
    dbPool
      .query(
        `INSERT INTO operators (user_id, tenant_id, email, display_name, role, password_hash, webauthn_credential_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash`,
        [user.userId, user.tenantId, user.email, user.name, roleDb, passwordComposite, user.webauthnCredentialId ?? null]
      )
      .catch((err) => console.warn("Failed to mirror operator to PostgreSQL:", err.message));
  }
}

/**
 * Validates cryptographic WebAuthn / Step-Up signature header (X-Axiom-StepUp-Signature)
 * for destructive actions (Emergency Kill Switch and Policy Bundle hot-swaps).
 * Eliminates shape-based bypass: requires authentic cryptographic HMAC-SHA256 over payload hash.
 */
export function verifyStepUpSignature(signatureHeader: string | null | undefined, payloadHash: string): boolean {
  if (!signatureHeader || signatureHeader.length < 32) return false;
  const isDevMode = process.env.AXIOM_DEV_MODE === "1" && process.env.NODE_ENV !== "production";
  const secret = process.env.AXIOM_ADMIN_TOKEN || process.env.AXIOM_STEPUP_SECRET;
  if (!secret) {
    if (!isDevMode) return false;
    return signatureHeader === "axm_dev_stepup_sig";
  }
  try {
    const expectedHmac = crypto.createHmac("sha256", secret).update(payloadHash).digest("hex");
    const providedBuf = Buffer.from(signatureHeader, "hex");
    const expectedBuf = Buffer.from(expectedHmac, "hex");
    if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function getOperatorSession(req: NextRequest): Promise<SessionRecord | null> {
  const token =
    req.cookies.get("axiom_session")?.value ||
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice(7).trim()
      : null);

  if (token) {
    // 1. Authoritative check against PostgreSQL operator_sessions when pool is active
    if (dbPool) {
      try {
        const res = await dbPool.query(
          `SELECT s.session_id, s.user_id, s.tenant_id, s.csrf_token, EXTRACT(EPOCH FROM s.expires_at)::bigint as expires_at_unix, o.role
           FROM operator_sessions s
           JOIN operators o ON s.user_id = o.user_id
           WHERE s.session_id = $1 AND s.revoked = FALSE AND s.expires_at > NOW()`,
          [token]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            sessionId: row.session_id,
            userId: row.user_id,
            tenantId: row.tenant_id,
            role: row.role as OperatorRole,
            csrfToken: row.csrf_token,
            expiresAtUnix: Number(row.expires_at_unix),
          };
        }
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          console.error("Database query failed during operator session validation:", err);
          return null;
        }
      }
    }

    // 2. Fallback to cached memory store
    const session = getSession(token);
    if (session) return session;
  }

  // Explicit dev mode fallback only when explicitly acknowledged and strictly outside production
  if (
    process.env.AXIOM_DEV_MODE === "1" &&
    process.env.AXIOM_ALLOW_ANONYMOUS_LOCAL === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    return {
      sessionId: "dev-session",
      userId: "user-sarah-chen",
      tenantId: "org-axiom-enterprise",
      role: "security-admin",
      csrfToken: "dev-csrf",
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600 * 24,
    };
  }

  return null;
}

export { usersByEmail, sessionsById };
