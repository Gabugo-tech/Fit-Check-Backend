import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method === "GET") {
    const { vendorId } = req.query;
    try {
      const sql = getDb();
      const reviews = vendorId
        ? await sql`SELECT * FROM reviews WHERE vendor_id = ${vendorId as string} ORDER BY created_at DESC`
        : await sql`SELECT * FROM reviews ORDER BY created_at DESC`;
      return res.status(200).json(reviews);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const token = getTokenFromHeader(req.headers.authorization);
    const user = token ? verifyToken(token) : null;
    if (!user) return res.status(401).json({ error: "Please sign in to leave a review" });

    const { vendorId, vendorName, itemTitle, customerName, rating, comment } = req.body || {};
    if (!vendorId || !rating || !comment) {
      return res.status(400).json({ error: "vendorId, rating, and comment are required" });
    }

    try {
      const sql = getDb();
      const result = await sql`
        INSERT INTO reviews (vendor_id, vendor_name, item_title, customer_name, rating, comment)
        VALUES (
          ${vendorId}, ${vendorName || null}, ${itemTitle || null},
          ${customerName || user.email}, ${rating}, ${comment}
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

