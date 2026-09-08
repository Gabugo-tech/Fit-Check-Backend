import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const token = getTokenFromHeader(req.headers.authorization);
  const user  = token ? verifyToken(token) : null;
  const type  = (req.query.type as string) || "purchase"; // "purchase" | "cart" | "order"

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  CART  (?type=cart)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (type === "cart") {
    if (!user) return res.status(401).json({ error: "Sign in to manage your cart" });

    // GET /api/purchases?type=cart  â€” fetch cart items
    if (req.method === "GET") {
      try {
        const sql = getDb();
        const rows = await sql`
          SELECT c.*, i.title, i.image_url, i.buy_price, i.current_bid, i.seller_name, i.condition, i.size, i.is_sold
          FROM carts c
          JOIN items i ON i.id = c.item_id
          WHERE c.user_email = ${user.email}
          ORDER BY c.added_at DESC
        `;
        return res.status(200).json(rows);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    // POST /api/purchases?type=cart  â€” add item to cart
    if (req.method === "POST") {
      const { itemId } = req.body || {};
      if (!itemId) return res.status(400).json({ error: "itemId is required" });
      try {
        const sql = getDb();
        const existing = await sql`SELECT id FROM carts WHERE user_email = ${user.email} AND item_id = ${itemId}`;
        if (existing.length > 0) {
          return res.status(200).json({ message: "Item already in cart", action: "existing" });
        }
        const row = await sql`
          INSERT INTO carts (user_email, item_id)
          VALUES (${user.email}, ${itemId})
          RETURNING *
        `;
        return res.status(201).json({ ...row[0], action: "added" });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    // DELETE /api/purchases?type=cart&itemId=xxx  â€” remove from cart
    if (req.method === "DELETE") {
      const { itemId } = req.query;
      if (!itemId) return res.status(400).json({ error: "itemId is required" });
      try {
        const sql = getDb();
        await sql`DELETE FROM carts WHERE user_email = ${user.email} AND item_id = ${itemId as string}`;
        return res.status(200).json({ ok: true });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  ORDERS  (?type=order)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (type === "order") {
    if (!user) return res.status(401).json({ error: "Sign in to view orders" });

    // GET /api/purchases?type=order  â€” fetch orders
    if (req.method === "GET") {
      try {
        const sql = getDb();
        const orders = user.isAdmin
          ? await sql`SELECT * FROM orders ORDER BY created_at DESC`
          : await sql`SELECT * FROM orders WHERE buyer_email = ${user.email} ORDER BY created_at DESC`;
        return res.status(200).json(orders);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    // POST /api/purchases?type=order  â€” place an order from cart checkout
    if (req.method === "POST") {
      const { itemId, buyerName, address, notes } = req.body || {};
      if (!itemId) return res.status(400).json({ error: "itemId is required" });

      try {
        const sql = getDb();
        const itemResult = await sql`SELECT * FROM items WHERE id = ${itemId}`;
        if (itemResult.length === 0) return res.status(404).json({ error: "Item not found" });

        const item = itemResult[0];
        if (item.is_sold) return res.status(409).json({ error: "This item has already been sold" });

        const amount = Number(item.buy_price || item.current_bid);

        // Create order
        const order = await sql`
          INSERT INTO orders (buyer_email, buyer_name, item_id, item_title, item_image, seller_id, amount, status, address, notes)
          VALUES (
            ${user.email},
            ${buyerName || user.email},
            ${itemId},
            ${item.title},
            ${item.image_url || null},
            ${item.seller_id || null},
            ${amount},
            'pending',
            ${address || null},
            ${notes || null}
          )
          RETURNING *
        `;

        // Mark item as sold
        await sql`UPDATE items SET is_sold = TRUE, highest_bidder = ${buyerName || user.email} WHERE id = ${itemId}`;

        // Remove from cart if present
        await sql`DELETE FROM carts WHERE user_email = ${user.email} AND item_id = ${itemId}`;

        return res.status(201).json(order[0]);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    // PATCH /api/purchases?type=order&id=xxx  â€” update order status (seller/admin)
    if (req.method === "PATCH") {
      const { id } = req.query;
      const { status } = req.body || {};
      if (!id) return res.status(400).json({ error: "Order id is required" });

      const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      }

      try {
        const sql = getDb();

        // Allow admin or the buyer who placed the order (seller update simplified)
        if (!user.isAdmin) {
          const orderCheck = await sql`SELECT buyer_email FROM orders WHERE id = ${id as string}`;
          if (orderCheck.length === 0) return res.status(404).json({ error: "Order not found" });
          if (orderCheck[0].buyer_email !== user.email) return res.status(403).json({ error: "Access denied" });
        }

        const updated = await sql`
          UPDATE orders SET status = ${status}, updated_at = NOW()
          WHERE id = ${id as string}
          RETURNING *
        `;
        if (updated.length === 0) return res.status(404).json({ error: "Order not found" });
        return res.status(200).json(updated[0]);
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  LEGACY PURCHASES (default, no ?type)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (req.method === "GET") {
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
      await sql`UPDATE items SET is_sold = TRUE, highest_bidder = ${buyerName || user.email} WHERE id = ${itemId}`;
      return res.status(201).json(purchase[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

