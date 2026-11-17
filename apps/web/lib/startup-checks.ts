// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Production Safety Checks
 * 
 * SHIP-BLOCKERS: These checks prevent deployment with insecure configuration.
 * The application will refuse to start in production if any check fails.
 */

export function verifyProductionSafety() {
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    process.env.AXIOM_ENV === 'production';

  if (!isProduction) {
    console.warn('⚠️  Running in development mode');
    console.warn('   Development security shortcuts are enabled');
    return; // Allow in dev
  }

  console.log('🔒 Running production safety checks...');

  const errors: string[] = [];

  // SHIP-BLOCKER 1: Dev mode in production
  if (process.env.AXIOM_DEV_MODE === '1') {
    errors.push('AXIOM_DEV_MODE=1 is set in production');
    errors.push('  This enables anonymous authentication');
    errors.push('  Set AXIOM_DEV_MODE=0 or remove the variable');
  }

  // SHIP-BLOCKER 2: Anonymous auth in production
  if (process.env.AXIOM_ALLOW_ANONYMOUS_LOCAL === '1') {
    errors.push('AXIOM_ALLOW_ANONYMOUS_LOCAL=1 is set in production');
    errors.push('  This bypasses authentication entirely');
    errors.push('  Set AXIOM_ALLOW_ANONYMOUS_LOCAL=0 or remove the variable');
  }

  // SHIP-BLOCKER 3: Default admin token
  const token = process.env.AXIOM_ADMIN_TOKEN;
  if (!token) {
    errors.push('AXIOM_ADMIN_TOKEN is not set');
    errors.push('  Generate a secure token: openssl rand -hex 32');
  } else if (
    token.includes('dev') ||
    token.includes('local') ||
    token.includes('test') ||
    token.length < 32
  ) {
    errors.push('AXIOM_ADMIN_TOKEN appears to be a dev/test token');
    errors.push('  Current: ' + token.substring(0, 10) + '...');
    errors.push('  Generate a secure token: openssl rand -hex 32');
  }

  // SHIP-BLOCKER 4: Session secret
  if (!process.env.SESSION_SECRET) {
    errors.push('SESSION_SECRET is not set');
    errors.push('  Generate a secure secret: openssl rand -base64 32');
  } else if (process.env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET is too short (minimum 32 characters)');
  }

  // SHIP-BLOCKER 5: Database URL
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set');
    errors.push('  Production requires PostgreSQL connection');
  } else if (process.env.DATABASE_URL.includes('localhost')) {
    errors.push('DATABASE_URL points to localhost');
    errors.push('  Production should use a managed database service');
  }

  // SHIP-BLOCKER 6: Stripe secrets in production (if billing enabled)
  if (process.env.STRIPE_SECRET_KEY) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      errors.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing');
      errors.push('  Both are required for secure billing');
    }
    if (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      errors.push('STRIPE_SECRET_KEY is a test key in production');
      errors.push('  Use live keys: sk_live_...');
    }
  }

  // Report results
  if (errors.length > 0) {
    console.error('\n❌ PRODUCTION SAFETY CHECK FAILED\n');
    errors.forEach(err => console.error('  ', err));
    console.error('\n');
    console.error('The application cannot start in production with these issues.');
    console.error('Fix the configuration and try again.\n');
    process.exit(1);
  }

  console.log('✅ All production safety checks passed');
}

// Additional: Check for accidentally committed secrets
export function warnAboutPotentialLeaks() {
  const suspiciousVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
    'PRIVATE_KEY',
  ];

  suspiciousVars.forEach(varName => {
    if (process.env[varName] && !process.env.CI) {
      console.warn(`⚠️  ${varName} is set in environment`);
      console.warn('   Ensure this is from a secure secret manager, not hardcoded');
    }
  });
}
