// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Stripe Checkout Session Creation (Phase 2: Billing Integration)
 * 
 * Architecture compliance:
 * - Server-selected price_id (never client-supplied)
 * - Opaque tenant reference in metadata
 * - No amount/entitlement trust from client
 * - Returns hosted checkout URL only
 */

import { NextRequest, NextResponse } from "next/server";
import { getOperatorSession } from "../../auth/store";
import Stripe from "stripe";

// Lazily initialize Stripe so builds do not require runtime secrets.
let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  stripeClient = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia" as any,
  });
  return stripeClient;
}

// Server-defined plan configurations
const PLAN_CONFIGS = {
  eval: {
    stripe_price_id: process.env.STRIPE_PRICE_EVAL || "price_eval_placeholder",
    display_name: "Evaluation",
    max_operators: 3,
    max_connections: 2,
    max_runtime_instances: 1,
  },
  team: {
    stripe_price_id: process.env.STRIPE_PRICE_TEAM || "price_team_placeholder",
    display_name: "Team",
    max_operators: 10,
    max_connections: 5,
    max_runtime_instances: 3,
  },
  enterprise: {
    // Enterprise uses custom contracts, not self-serve checkout
    stripe_price_id: null,
    display_name: "Enterprise",
    max_operators: 999,
    max_connections: 999,
    max_runtime_instances: 999,
  },
} as const;

type PlanId = keyof typeof PLAN_CONFIGS;

export async function POST(req: NextRequest) {
  // 1. Verify authenticated session
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify operator has billing permission (security-admin or owner role)
  if (session.role !== "security-admin" && session.role !== "operator") {
    return NextResponse.json(
      { error: "Forbidden: Only security-admin can manage billing" },
      { status: 403 }
    );
  }

  // 3. Parse and validate request body
  const body = await req.json();
  const requestedPlan = body.plan as PlanId;

  if (!requestedPlan || !(requestedPlan in PLAN_CONFIGS)) {
    return NextResponse.json(
      { error: "Invalid plan. Must be one of: eval, team, enterprise" },
      { status: 400 }
    );
  }

  const planConfig = PLAN_CONFIGS[requestedPlan];

  // 4. Enterprise requires sales contact, not self-serve checkout
  if (requestedPlan === "enterprise" || !planConfig.stripe_price_id) {
    return NextResponse.json(
      {
        error: "Enterprise plan requires custom contract",
        contact_sales_url: "https://axiom.io/contact-sales",
      },
      { status: 400 }
    );
  }

  // 5. Verify Stripe is configured
  const stripe = getStripe();
  if (!stripe) {
    console.error(
      "STRIPE_SECRET_KEY is not configured; billing checkout is unavailable"
    );
    return NextResponse.json(
      {
        error: "Billing provider not configured. Contact support.",
        support_email: "support@axiom.io",
      },
      { status: 503 }
    );
  }

  // 6. SERVER-SELECTED price_id and metadata (never trust client values)
  const checkoutConfig: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: planConfig.stripe_price_id,
        quantity: 1,
      },
    ],
    metadata: {
      // Opaque tenant reference for webhook processing
      tenant_id: session.tenantId,
      operator_id: session.userId,
      plan_id: requestedPlan,
      // Server timestamp to detect replay attacks
      created_at: new Date().toISOString(),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=canceled`,
    // Customer email for receipt (if verified)
    customer_email: body.email || undefined,
    // Billing address collection for tax calculation
    billing_address_collection: "required",
    // Tax calculation (requires Stripe Tax integration)
    automatic_tax: {
      enabled: true,
    },
    // Allow promotion codes
    allow_promotion_codes: true,
    // Subscription configuration
    subscription_data: {
      metadata: {
        tenant_id: session.tenantId,
        plan_id: requestedPlan,
      },
    },
  };

  try {
    // 7. Create checkout session with Stripe
    const checkoutSession = await stripe.checkout.sessions.create(checkoutConfig);

    // 8. Return ONLY the hosted checkout URL (do not trust redirect as payment proof)
    return NextResponse.json(
      {
        checkout_url: checkoutSession.url,
        session_id: checkoutSession.id,
        // Show pending status immediately
        status: "pending_payment",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);

    // Don't leak Stripe internals to client
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        support_contact: "support@axiom.io",
      },
      { status: 500 }
    );
  }
}

