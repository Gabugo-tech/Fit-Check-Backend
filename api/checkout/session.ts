import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getDb } from "../lib/db";
import { getTokenFromHeader, verifyToken } from "../lib/auth";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = getTokenFromHeader(req.headers.authorization);
  const user = token ? verifyToken(token) : null;

  if (!user) {
    return res.status(401).json({ error: "Please sign in to continue to checkout" });
  }

  const { itemId, buyerName } = req.body || {};
  if (!itemId) {
    return res.status(400).json({ error: "itemId is required" });
  }

  try {
    const sql = getDb();
    const itemResult = await sql`SELECT * FROM items WHERE id = ${itemId}`;
    if (itemResult.length === 0) return res.status(404).json({ error: "Item not found" });

    const item = itemResult[0];
    if (item.is_sold) {
      return res.status(409).json({ error: "This item has already been sold" });
    }

    const amount = Number(item.buy_price ?? item.current_bid ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "A valid checkout amount is required" });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(503).json({
        error: "Checkout is not available yet. Payment processing is not configured. Please contact support."
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2026-08-26.dahlia" });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email,
        success_url: `${process.env.APP_URL ?? "http://localhost:3000"}?checkout=success`,
        cancel_url: `${process.env.APP_URL ?? "http://localhost:3000"}?checkout=cancelled`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: item.title,
                description: item.description || "Vintage item",
              },
            },
          },
        ],
        metadata: {
          itemId,
          buyerEmail: user.email,
          buyerName: buyerName || user.email,
          userId: user.id,
        },
      });

      return res.status(200).json({
        id: session.id,
        url: session.url,
        mode: "stripe",
        amount,
      });
  } catch (error: any) {
    console.error("Checkout session error:", error);
    return res.status(500).json({ error: error.message || "Checkout failed" });
  }
}

