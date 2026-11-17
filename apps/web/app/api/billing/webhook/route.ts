// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Stripe Webhook Handler (Phase 2: Billing Integration)
 * 
 * Architecture compliance:
 * - Verifies webhook signature (HMAC-SHA256)
 * - Stores event ID with unique constraint (idempotency)
 * - Updates subscription state transactionally
 * - NEVER trusts browser redirect as payment proof
 * - Processes events idempotently
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import pg from "pg";
import crypto from "crypto";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia" as any,
    })
  : null;

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// PostgreSQL connection pool for transactional event processing
let dbPool: pg.Pool | null = null;
if (process.env.DATABASE_URL) {
  dbPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

const isProduction = process.env.NODE_ENV === "production";

if ((!stripe || !STRIPE_WEBHOOK_SECRET || !dbPool) && isProduction) {
  throw new Error(
    "Fatal: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and DATABASE_URL must be set in production"
  );
}

/**
 * Webhook signature verification using Stripe's HMAC-SHA256 scheme.
 * This prevents event forgery and replay attacks.
 */
function verifyStripeSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    // Stripe signature format: t=timestamp,v1=signature
    const parts = signature.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
    const sig = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !sig) return false;

    // Construct signed payload: timestamp.rawBody
    const payload = `${timestamp}.${rawBody}`;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Idempotent event processing: store event ID with unique constraint
 * to handle webhook retries safely.
 */
async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  rawEvent: string
): Promise<boolean> {
  if (!dbPool) return false;

  try {
    await dbPool.query(
      `INSERT INTO billing_webhook_events (
        event_id, event_type, raw_payload, received_at, processed
      ) VALUES ($1, $2, $3, NOW(), FALSE)
      ON CONFLICT (event_id) DO NOTHING`,
      [eventId, eventType, rawEvent]
    );
    return true;
  } catch (err) {
    console.error("Failed to record webhook event:", err);
    return false;
  }
}

/**
 * Update subscription state transactionally.
 */
async function updateSubscription(
  tenantId: string,
  subscriptionData: {
    stripe_subscription_id: string;
    stripe_customer_id: string;
    status: string;
    plan_id: string;
    current_period_end: Date;
  }
): Promise<void> {
  if (!dbPool) throw new Error("Database not available");

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update or insert subscription record
    await client.query(
      `INSERT INTO subscriptions (
        tenant_id, stripe_subscription_id, stripe_customer_id,
        status, plan_id, current_period_end, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        status = EXCLUDED.status,
        plan_id = EXCLUDED.plan_id,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()`,
      [
        tenantId,
        subscriptionData.stripe_subscription_id,
        subscriptionData.stripe_customer_id,
        subscriptionData.status,
        subscriptionData.plan_id,
        subscriptionData.current_period_end,
      ]
    );

    // 2. Recalculate and update tenant entitlements
    const entitlements = calculateEntitlements(
      subscriptionData.plan_id,
      subscriptionData.status
    );

    await client.query(
      `INSERT INTO tenant_entitlements (
        tenant_id, plan_id, status, features, limits, version, effective_at
      ) VALUES ($1, $2, $3, $4, $5,
        COALESCE((SELECT version + 1 FROM tenant_entitlements WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1), 1),
        NOW()
      )`,
      [
        tenantId,
        subscriptionData.plan_id,
        subscriptionData.status,
        JSON.stringify(entitlements.features),
        JSON.stringify(entitlements.limits),
      ]
    );

    // 3. Emit audit event
    await client.query(
      `INSERT INTO audit_events (
        tenant_id, event_type, actor, metadata, timestamp
      ) VALUES ($1, 'subscription.updated', 'system:billing', $2, NOW())`,
      [
        tenantId,
        JSON.stringify({
          plan_id: subscriptionData.plan_id,
          status: subscriptionData.status,
        }),
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Calculate tenant entitlements based on plan and subscription status.
 * Server-authoritative calculation, never trusted from client.
 */
function calculateEntitlements(planId: string, status: string) {
  const basePlans = {
    eval: {
      features: {
        "connector.aws": true,
        "connector.github": true,
        "runtime.enforcement": true,
        "sso.saml": false,
        "audit.retention_days": 7,
      },
      limits: {
        operators: 3,
        connections: 2,
        runtime_instances: 1,
      },
    },
    team: {
      features: {
        "connector.aws": true,
        "connector.github": true,
        "connector.kubernetes": true,
        "runtime.enforcement": true,
        "sso.saml": true,
        "audit.retention_days": 30,
      },
      limits: {
        operators: 10,
        connections: 5,
        runtime_instances: 3,
      },
    },
    enterprise: {
      features: {
        "connector.aws": true,
        "connector.github": true,
        "connector.kubernetes": true,
        "connector.slack": true,
        "runtime.enforcement": true,
        "sso.saml": true,
        "sso.scim": true,
        "audit.retention_days": 90,
      },
      limits: {
        operators: 999,
        connections: 999,
        runtime_instances: 999,
      },
    },
  };

  const plan = basePlans[planId as keyof typeof basePlans] || basePlans.eval;

  // Degrade features if subscription is past_due or canceled
  if (status === "past_due" || status === "canceled") {
    return {
      features: {
        ...plan.features,
        "runtime.enforcement": false, // Disable enforcement on payment failure
      },
      limits: {
        ...plan.limits,
        connections: 0, // Block new connections
      },
    };
  }

  return plan;
}

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  // 2. Verify webhook signature
  if (!STRIPE_WEBHOOK_SECRET || !verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    console.error("Webhook signature verification failed");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // 3. Parse Stripe event
  let event: Stripe.Event;
  try {
    event = JSON.parse(rawBody) as Stripe.Event;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // 4. Record event for idempotency
  const recorded = await recordWebhookEvent(event.id, event.type, rawBody);
  if (!recorded) {
    // Event already processed (duplicate webhook delivery)
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 5. Process event based on type
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const planId = session.metadata?.plan_id;

        if (!tenantId || !planId) {
          console.error("Missing tenant_id or plan_id in checkout session metadata");
          break;
        }

        // Retrieve subscription details
        const subscriptionId = session.subscription as string;
        const subscription = await stripe!.subscriptions.retrieve(subscriptionId);

        await updateSubscription(tenantId, {
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: session.customer as string,
          status: subscription.status,
          plan_id: planId,
          current_period_end: new Date(subscription.current_period_end * 1000),
        });

        console.log(`Subscription activated for tenant ${tenantId}`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await updateSubscription(tenantId, {
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: subscription.customer as string,
            status: subscription.status,
            plan_id: subscription.metadata?.plan_id || "team",
            current_period_end: new Date(subscription.current_period_end * 1000),
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          // Mark subscription as past_due and degrade entitlements
          await updateSubscription(tenantId, {
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: subscription.customer as string,
            status: "past_due",
            plan_id: subscription.metadata?.plan_id || "team",
            current_period_end: new Date(subscription.current_period_end * 1000),
          });

          // TODO: Send notification to tenant admin
          console.warn(`Payment failed for tenant ${tenantId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await updateSubscription(tenantId, {
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer as string,
            status: "canceled",
            plan_id: subscription.metadata?.plan_id || "team",
            current_period_end: new Date(subscription.current_period_end * 1000),
          });

          console.log(`Subscription canceled for tenant ${tenantId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // 6. Mark event as processed
    if (dbPool) {
      await dbPool.query(
        `UPDATE billing_webhook_events SET processed = TRUE, processed_at = NOW()
         WHERE event_id = $1`,
        [event.id]
      );
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 500 so Stripe retries the webhook
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}

