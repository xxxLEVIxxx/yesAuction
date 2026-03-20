import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminToken, COOKIE_NAME } from "@/lib/admin-session";

export async function POST(req: Request) {
  const expected = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not configured" }, { status: 501 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const received = (body.password ?? "").trim();
  if (received !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = createAdminToken();
  if (!token) {
    return NextResponse.json({ error: "Session secret missing" }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 7 * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
