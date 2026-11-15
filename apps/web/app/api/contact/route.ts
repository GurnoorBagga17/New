import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const company = String(body.company || "").trim();
    const agentCount = String(body.agentCount || "50-250");
    const challenge = String(body.challenge || "mcp-security");
    const message = String(body.message || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid work email is required" }, { status: 400 });
    }

    const ticketId = `AXM-ENG-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Transactional Email via Resend (if configured)
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Axiom NHI <security@axiomnhi.dev>",
          to: [process.env.CONTACT_TO_EMAIL || "founders@axiomnhi.dev"],
          subject: `[${ticketId}] Security Architect Request: ${email} (${company || "Unknown Org"})`,
          text: `Ticket: ${ticketId}\nName: ${name}\nEmail: ${email}\nCompany: ${company}\nAgent Fleet: ${agentCount}\nChallenge: ${challenge}\nNotes: ${message}`,
        }),
      }).catch((err) => {
        console.error("Failed to dispatch Resend email:", err);
      });
    }

    // 2. Dispatch to Slack Webhook (if configured)
    if (process.env.SLACK_LEADS_WEBHOOK_URL) {
      await fetch(process.env.SLACK_LEADS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🛡️ *New Axiom NHI Security Lead* [${ticketId}]\n*Contact*: ${name} <${email}> (${company || "N/A"})\n*Fleet*: ${agentCount} agents | *Priority*: ${challenge}\n*Notes*: ${message || "None"}`,
        }),
      }).catch((err) => {
        console.error("Failed to dispatch Slack lead notification:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      ticketId,
      message: "Security engineering team notified. Response scheduled under 15 minutes.",
    });
  } catch (err) {
    console.error("Error processing contact request:", err);
    return NextResponse.json({ error: "Invalid request payload" }, { status: 500 });
  }
}
