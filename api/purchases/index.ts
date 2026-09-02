import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    try {
      const sql = getDb();
      const purchases = user.isAdmin
        ? await sql`SELECT * FROM purchases ORDER BY created_at DESC`
        : await sql`SELECT * FROM purchases WHERE buyer_email = ${user.email} ORDER BY created_at DESC`;
      return res.status(200).json(purchases);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user) return res.status(401).json({ error: "Please sign in to purchase" });

    const { itemId, buyerName } = req.body || {};
    if (!itemId) return res.status(400).json({ error: "itemId is required" });

    try {
      const sql = getDb();
      const itemResult = await sql`SELECT * FROM items WHERE id = ${itemId}`;
      if (itemResult.length === 0) return res.status(404).json({ error: "Item not found" });

      const item = itemResult[0];
      if (item.is_sold) return res.status(409).json({ error: "This item has already been sold" });

      const price = Number(item.buy_price || item.current_bid);

      const purchase = await sql`
        INSERT INTO purchases (item_id, buyer_email, buyer_name, amount)
        VALUES (${itemId}, ${user.email}, ${buyerName || user.email}, ${price})
        RETURNING *
      `;

      await sql`
        UPDATE items
        SET is_sold = TRUE, highest_bidder = ${buyerName || user.email}
        WHERE id = ${itemId}
      `;

      return res.status(201).json(purchase[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

