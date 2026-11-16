import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface TenantUserRecord {
  readonly userId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly passwordSaltHex: string;
  readonly passwordHashHex: string;
  readonly role: "security-admin" | "operator" | "auditor";
  readonly mfaEnabled: boolean;
  readonly createdAtIso: string;
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly role: "security-admin" | "operator" | "auditor";
  readonly csrfToken: string;
  readonly expiresAtUnix: number;
}

const DATA_DIR = process.env.AXIOM_DATA_DIR || path.resolve(process.cwd(), "../../data/axiom");
const STORE_FILE = path.join(DATA_DIR, "web_auth_store.json");

const usersByEmail = new Map<string, TenantUserRecord>();
const sessionsById = new Map<string, SessionRecord>();

// Initialize persistent disk backing
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

// Load existing data immediately
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

export function createSession(user: TenantUserRecord): SessionRecord {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const session: SessionRecord = {
    sessionId,
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    csrfToken,
    expiresAtUnix: Math.floor(Date.now() / 1000) + 3600 * 8,
  };
  sessionsById.set(sessionId, session);
  persistStore();
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
}

export { usersByEmail, sessionsById };
