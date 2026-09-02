import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../lib/db";
import { getTokenFromHeader, verifyToken } from "../lib/auth";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    try {
      const sql = getDb();
      const items = await sql`SELECT * FROM items ORDER BY created_at DESC`;
      return res.status(200).json(items);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

    const {
      title, description, category, era, condition, size,
      sellerId, sellerName, sellerAvatar, marketName, imageUrl,
      startingBid, buyPrice, biddingEndsAt, tags, measurements, materials, history
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "Title is required" });

    try {
      const sql = getDb();
      const result = await sql`
        INSERT INTO items (
          title, description, category, era, condition, size,
          seller_id, seller_name, seller_avatar, market_name, image_url,
          starting_bid, current_bid, buy_price, bidding_ends_at,
          tags, measurements, materials, history
        ) VALUES (
          ${title}, ${description || null}, ${category || null}, ${era || null},
          ${condition || null}, ${size || null}, ${sellerId || null}, ${sellerName || null},
          ${sellerAvatar || null}, ${marketName || null}, ${imageUrl || null},
          ${startingBid || 0}, ${startingBid || 0}, ${buyPrice || null},
          ${biddingEndsAt || null}, ${tags || []}, ${JSON.stringify(measurements || {})},
          ${materials || []}, ${history || null}
        )
        RETURNING *
      `;
      return res.status(201).json(result[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

