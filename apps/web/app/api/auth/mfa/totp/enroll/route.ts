// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * TOTP (Time-based One-Time Password) Enrollment
 * Phase 1: Secure Identity - MFA Implementation
 */

import { NextRequest, NextResponse } from "next/server";
import { getOperatorSession, getUserById, saveUser } from "../../../store";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import crypto from "crypto";
import {
  encryptTotpSecret,
  decryptTotpSecret,
  encryptTotpSecretPermanent,
  generateRecoveryCodes,
} from "@/lib/mfa";

export async function POST(req: NextRequest) {
  // 1. Verify authenticated session
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get current user
  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 3. Check if TOTP already enabled
  if (user.mfaEnabled) {
    return NextResponse.json(
      { error: "MFA already enabled. Disable it first before re-enrolling." },
      { status: 400 }
    );
  }

  // 4. Generate TOTP secret (base32 encoded)
  const secret = authenticator.generateSecret();

  // 5. Generate OTP Auth URL for QR code
  const otpAuthUrl = authenticator.keyuri(
    user.email,
    "Axiom NHI",
    secret
  );

  // 6. Generate QR code data URL
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // 7. Store secret temporarily in session or database
    // For security, we'll store it encrypted with a temporary nonce
    const nonce = crypto.randomBytes(16).toString("hex");
    const encryptedSecret = encryptTotpSecret(secret, nonce);

    // Return enrollment data
    return NextResponse.json({
      secret, // Manual entry fallback
      qrCode: qrCodeDataUrl,
      enrollmentNonce: nonce, // Used to verify challenge
      encryptedSecret, // Store this temporarily
      instructions: [
        "Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)",
        "Or manually enter the secret key into your app",
        "Then verify by submitting a code from your app",
      ],
    });
  } catch (err) {
    console.error("Failed to generate QR code:", err);
    return NextResponse.json(
      { error: "Failed to generate enrollment QR code" },
      { status: 500 }
    );
  }
}

/**
 * Verify TOTP challenge and complete enrollment
 */
export async function PUT(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const { code, enrollmentNonce, encryptedSecret } = body;

  if (!code || !enrollmentNonce || !encryptedSecret) {
    return NextResponse.json(
      { error: "Missing required fields: code, enrollmentNonce, encryptedSecret" },
      { status: 400 }
    );
  }

  // 1. Decrypt the TOTP secret
  const secret = decryptTotpSecret(encryptedSecret, enrollmentNonce);
  if (!secret) {
    return NextResponse.json(
      { error: "Invalid enrollment session. Please start enrollment again." },
      { status: 400 }
    );
  }

  // 2. Verify the TOTP code
  const isValid = authenticator.verify({
    token: code,
    secret: secret,
  });

  if (!isValid) {
    return NextResponse.json(
      {
        error: "Invalid verification code",
        hint: "Please check your authenticator app and try again",
      },
      { status: 400 }
    );
  }

  // 3. Save TOTP secret to user record and enable MFA
  const updatedUser = {
    ...user,
    mfaEnabled: true,
    // Store encrypted TOTP secret (in production, use proper KMS)
    totpSecret: encryptTotpSecretPermanent(secret),
  };

  saveUser(updatedUser as any);

  // 4. Generate recovery codes
  const recoveryCodes = generateRecoveryCodes();

  return NextResponse.json({
    success: true,
    message: "TOTP enrollment successful",
    recoveryCodes,
    warning: "Save these recovery codes in a secure location. They can be used to access your account if you lose your authenticator device.",
  });
}

