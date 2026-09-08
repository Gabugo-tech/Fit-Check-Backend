import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Item ID required" });

  // ── GET single item ───────────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const sql = getDb();
      const result = await sql`SELECT * FROM items WHERE id = ${id}`;
      if (result.length === 0) return res.status(404).json({ error: "Item not found" });
      return res.status(200).json(result[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH — update item (admin only) ─────────────────────────────────────
  if (req.method === "PATCH") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

    const {
      title, description, category, era, condition, size,
      sellerId, sellerName, sellerAvatar, marketName, imageUrl,
      startingBid, currentBid, buyPrice, biddingEndsAt,
      isSold, bidDropped, bidDroppedReason,
      tags, measurements, materials, history, quantity,
    } = req.body || {};

    try {
      const sql = getDb();
      const result = await sql`
        UPDATE items SET
          title              = COALESCE(${title              ?? null}, title),
          description        = COALESCE(${description        ?? null}, description),
          category           = COALESCE(${category           ?? null}, category),
          era                = COALESCE(${era                ?? null}, era),
          condition          = COALESCE(${condition          ?? null}, condition),
          size               = COALESCE(${size               ?? null}, size),
          seller_id          = COALESCE(${sellerId           ?? null}, seller_id),
          seller_name        = COALESCE(${sellerName         ?? null}, seller_name),
          seller_avatar      = COALESCE(${sellerAvatar       ?? null}, seller_avatar),
          market_name        = COALESCE(${marketName         ?? null}, market_name),
          image_url          = COALESCE(${imageUrl           ?? null}, image_url),
          starting_bid       = COALESCE(${startingBid        ?? null}, starting_bid),
          current_bid        = COALESCE(${currentBid         ?? null}, current_bid),
          buy_price          = COALESCE(${buyPrice           ?? null}, buy_price),
          bidding_ends_at    = COALESCE(${biddingEndsAt      ?? null}, bidding_ends_at),
          is_sold            = COALESCE(${isSold             ?? null}, is_sold),
          bid_dropped        = COALESCE(${bidDropped         ?? null}, bid_dropped),
          bid_dropped_reason = COALESCE(${bidDroppedReason   ?? null}, bid_dropped_reason),
          tags               = COALESCE(${tags               ?? null}, tags),
          measurements       = COALESCE(${measurements ? JSON.stringify(measurements) : null}::jsonb, measurements),
          materials          = COALESCE(${materials          ?? null}, materials),
          history            = COALESCE(${history            ?? null}, history),
          quantity           = COALESCE(${quantity           ?? null}, quantity)
        WHERE id = ${id}
        RETURNING *
      `;
      if (result.length === 0) return res.status(404).json({ error: "Item not found" });
      return res.status(200).json(result[0]);
    } catch (err: any) {
      console.error("PATCH item error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE item (admin only) ──────────────────────────────────────────────
  if (req.method === "DELETE") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

    try {
      const sql = getDb();
      const result = await sql`DELETE FROM items WHERE id = ${id} RETURNING id`;
      if (result.length === 0) return res.status(404).json({ error: "Item not found" });
      return res.status(200).json({ ok: true, deleted: id });
    } catch (err: any) {
      console.error("DELETE item error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
