import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../lib/db";
import { getTokenFromHeader, verifyToken } from "../lib/auth";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Item ID required" });

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

  if (req.method === "PATCH") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

    const { title, currentBid, isSold, bidDropped, bidDroppedReason, imageUrl } = req.body || {};

    try {
      const sql = getDb();
      const result = await sql`
        UPDATE items SET
          title              = COALESCE(${title ?? null}, title),
          current_bid        = COALESCE(${currentBid ?? null}, current_bid),
          is_sold            = COALESCE(${isSold ?? null}, is_sold),
          bid_dropped        = COALESCE(${bidDropped ?? null}, bid_dropped),
          bid_dropped_reason = COALESCE(${bidDroppedReason ?? null}, bid_dropped_reason),
          image_url          = COALESCE(${imageUrl ?? null}, image_url)
        WHERE id = ${id}
        RETURNING *
      `;
      if (result.length === 0) return res.status(404).json({ error: "Item not found" });
      return res.status(200).json(result[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

    try {
      const sql = getDb();
      await sql`DELETE FROM items WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
