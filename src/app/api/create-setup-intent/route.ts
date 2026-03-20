import Stripe from "stripe";
import { NextResponse } from "next/server";

const secret = process.env.STRIPE_SECRET_KEY;

export async function POST(req: Request) {
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { email, name, uid } = body as { email?: string; name?: string; uid?: string };
    if (!email || !uid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const stripe = new Stripe(secret);
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { uid },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
