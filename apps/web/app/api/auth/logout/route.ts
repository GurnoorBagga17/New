// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession } from "../store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("axiom_session");
    if (sessionCookie && sessionCookie.value) {
      deleteSession(sessionCookie.value);
    }

    const response = NextResponse.json({
      ok: true,
      loggedOut: true,
      timestampIso: new Date().toISOString(),
    });

    response.cookies.set("axiom_session", "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    response.cookies.set("axiom_csrf", "", {
      path: "/",
      maxAge: 0,
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json(
      { ok: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}
