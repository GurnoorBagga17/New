import crypto from "crypto";

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

const usersByEmail = new Map<string, TenantUserRecord>();
const sessionsById = new Map<string, SessionRecord>();

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
  return session;
}

export { usersByEmail, sessionsById };
