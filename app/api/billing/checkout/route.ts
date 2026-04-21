import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

async function getOrCreateCustomer(stripe: Stripe, email: string, userId: string) {
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
  const stripePriceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecretKey || !stripePriceId) {
    return NextResponse.json(
      { error: "Stripe is not configured. Please set STRIPE_SECRET_KEY and STRIPE_PRICE_ID." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const { origin } = new URL(request.url);

    // Reuse existing Stripe customer (and their saved card) if possible
    const customerId = await getOrCreateCustomer(
      stripe,
      session.user.email!,
      session.user.id
    );

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing?status=success`,
      cancel_url: `${origin}/billing?status=cancelled`,
      metadata: {
        userId: session.user.id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to create Stripe Checkout session." },
      { status: 500 }
    );
  }
}

