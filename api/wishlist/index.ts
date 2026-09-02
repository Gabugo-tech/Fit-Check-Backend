import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const token = getTokenFromHeader(req.headers.authorization);
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "GET") {
    try {
      const sql = getDb();
      const rows = await sql`SELECT item_id FROM wishlists WHERE user_email = ${user.email}`;
      return res.status(200).json(rows.map((r: any) => r.item_id));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { itemId } = req.body || {};
    if (!itemId) return res.status(400).json({ error: "itemId is required" });

    try {
      const sql = getDb();
      const existing = await sql`
        SELECT id FROM wishlists WHERE user_email = ${user.email} AND item_id = ${itemId}
      `;

      if (existing.length > 0) {
        await sql`DELETE FROM wishlists WHERE user_email = ${user.email} AND item_id = ${itemId}`;
        return res.status(200).json({ action: "removed", itemId });
      } else {
        await sql`INSERT INTO wishlists (user_email, item_id) VALUES (${user.email}, ${itemId})`;
        return res.status(201).json({ action: "added", itemId });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

