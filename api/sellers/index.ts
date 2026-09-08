import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { getTokenFromHeader, verifyToken } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const { id } = req.query;

  // ── GET /api/sellers — list all sellers ───────────────────────────────────
  if (req.method === "GET" && !id) {
    try {
      const sql = getDb();
      const sellers = await sql`SELECT * FROM sellers ORDER BY created_at ASC`;
      return res.status(200).json(sellers);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/sellers?id=xxx — get single seller ───────────────────────────
  if (req.method === "GET" && id) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT * FROM sellers WHERE id = ${id as string}`;
      if (rows.length === 0) return res.status(404).json({ error: "Seller not found" });
      return res.status(200).json(rows[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // All write operations require admin auth
  const token = getTokenFromHeader(req.headers.authorization);
  const user  = token ? verifyToken(token) : null;
  if (!user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  // ── POST /api/sellers — create seller ─────────────────────────────────────
  if (req.method === "POST") {
    const { name, curator, email, password, avatar, tagline, bio, location, rating, established, aesthetic, bannerImage } = req.body || {};

    if (!name?.trim() || !curator?.trim()) {
      return res.status(400).json({ error: "Seller name and curator name are required" });
    }

    try {
      const sql = getDb();

      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        const { hashPassword } = await import("../../lib/auth");
        hashedPassword = await hashPassword(password);
      }

      const result = await sql`
        INSERT INTO sellers (name, curator, email, password, avatar, tagline, bio, location, rating, established, aesthetic, banner_image)
        VALUES (
          ${name.trim()},
          ${curator.trim()},
          ${email?.trim()?.toLowerCase() || null},
          ${hashedPassword},
          ${avatar || null},
          ${tagline || null},
          ${bio || null},
          ${location || null},
          ${rating ?? 5.0},
          ${established || null},
          ${aesthetic || null},
          ${bannerImage || null}
        )
        RETURNING id, name, curator, email, avatar, tagline, bio, location, rating, established, aesthetic, banner_image, created_at
      `;
      return res.status(201).json(result[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH /api/sellers?id=xxx — update seller ─────────────────────────────
  if (req.method === "PATCH" && id) {
    const { name, curator, avatar, tagline, bio, location, rating, established, aesthetic, bannerImage } = req.body || {};

    try {
      const sql = getDb();
      const result = await sql`
        UPDATE sellers SET
          name         = COALESCE(${name         ?? null}, name),
          curator      = COALESCE(${curator      ?? null}, curator),
          avatar       = COALESCE(${avatar       ?? null}, avatar),
          tagline      = COALESCE(${tagline      ?? null}, tagline),
          bio          = COALESCE(${bio          ?? null}, bio),
          location     = COALESCE(${location     ?? null}, location),
          rating       = COALESCE(${rating       ?? null}, rating),
          established  = COALESCE(${established  ?? null}, established),
          aesthetic    = COALESCE(${aesthetic    ?? null}, aesthetic),
          banner_image = COALESCE(${bannerImage  ?? null}, banner_image)
        WHERE id = ${id as string}
        RETURNING *
      `;
      if (result.length === 0) return res.status(404).json({ error: "Seller not found" });
      return res.status(200).json(result[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE /api/sellers?id=xxx — delete seller ────────────────────────────
  if (req.method === "DELETE" && id) {
    try {
      const sql = getDb();
      await sql`DELETE FROM sellers WHERE id = ${id as string}`;
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed, take care!!!" });
}
