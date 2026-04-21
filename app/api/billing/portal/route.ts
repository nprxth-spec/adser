import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

async function getOrCreateCustomer(stripe: Stripe, email: string, userId: string) {
  // Try to find an existing customer by email
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  const created = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return created.id;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Stripe is not configured. Please set STRIPE_SECRET_KEY." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const { origin } = new URL(request.url);
    const customerId = await getOrCreateCustomer(
      stripe,
      session.user.email!,
      session.user.id
    );

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to create Stripe billing portal session." },
      { status: 500 }
    );
  }
}

