// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * MFA and TOTP Cryptographic Helpers
 */

import crypto from "crypto";

export function encryptTotpSecret(secret: string, nonce: string): string {
  const key = process.env.AXIOM_ADMIN_TOKEN || "dev-key";
  const combined = nonce + key;
  const hash = crypto.createHash("sha256").update(combined).digest();
  
  const buf = Buffer.from(secret);
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = (buf[i] ?? 0) ^ (hash[i % hash.length] ?? 0);
  }
  
  return out.toString("base64");
}

export function decryptTotpSecret(encrypted: string, nonce: string): string | null {
  try {
    const key = process.env.AXIOM_ADMIN_TOKEN || "dev-key";
    const combined = nonce + key;
    const hash = crypto.createHash("sha256").update(combined).digest();
    
    const buf = Buffer.from(encrypted, "base64");
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = (buf[i] ?? 0) ^ (hash[i % hash.length] ?? 0);
    }
    
    return out.toString("utf-8");
  } catch {
    return null;
  }
}

export function encryptTotpSecretPermanent(secret: string): string {
  const key = process.env.SESSION_SECRET || process.env.AXIOM_ADMIN_TOKEN || "dev-key";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    crypto.createHash("sha256").update(key).digest(),
    iv
  );
  
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptTotpSecretPermanent(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid encrypted format: expected iv:encrypted");
  }
  const ivHex = parts[0];
  const encryptedHex = parts[1];
  const key = process.env.SESSION_SECRET || process.env.AXIOM_ADMIN_TOKEN || "dev-key";
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    crypto.createHash("sha256").update(key).digest(),
    iv
  );
  
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}
