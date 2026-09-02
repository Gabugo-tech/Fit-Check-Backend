import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../lib/db";
import { getTokenFromHeader, verifyToken } from "../lib/auth";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    const { itemId } = req.query;
    try {
      const sql = getDb();
      const bids = itemId
        ? await sql`SELECT * FROM bids WHERE item_id = ${itemId as string} ORDER BY created_at ASC`
        : await sql`SELECT * FROM bids ORDER BY created_at DESC`;
      return res.status(200).json(bids);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user) return res.status(401).json({ error: "Please sign in to place a bid" });

    const { itemId, amount, bidderName } = req.body || {};
    if (!itemId || !amount) return res.status(400).json({ error: "itemId and amount are required" });

    try {
      const sql = getDb();
      const itemResult = await sql`SELECT * FROM items WHERE id = ${itemId}`;
      if (itemResult.length === 0) return res.status(404).json({ error: "Item not found" });

      const item = itemResult[0];
      if (item.is_sold) return res.status(409).json({ error: "This item has already been sold" });

      // Check auction has not expired
      if (item.bidding_ends_at && new Date() > new Date(item.bidding_ends_at)) {
        return res.status(410).json({ error: "This auction has ended and is no longer accepting bids." });
      }

      // Validate bid amount is a real positive number with a sane maximum
      const bidAmount = Number(amount);
      if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
        return res.status(400).json({ error: "Bid amount must be a positive number." });
      }
      if (bidAmount > 100_000_000) {
        return res.status(400).json({ error: "Bid amount exceeds the maximum allowed value." });
      }

      if (bidAmount <= Number(item.current_bid)) {
        return res.status(400).json({
          error: `Bid must exceed current highest bid of ₦${Number(item.current_bid).toLocaleString()}`
        });
      }

      const bid = await sql`
        INSERT INTO bids (item_id, item_title, bidder_name, bidder_email, amount)
        VALUES (${itemId}, ${item.title}, ${bidderName || user.email}, ${user.email}, ${amount})
        RETURNING *
      `;

      await sql`
        UPDATE items
        SET current_bid = ${amount},
            bids_count  = bids_count + 1,
            highest_bidder = ${bidderName || user.email}
        WHERE id = ${itemId}
      `;

      return res.status(201).json(bid[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

