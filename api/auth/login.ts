import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../lib/db";
import { comparePassword, sanitizeEmail, signToken } from "../lib/auth";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedEmail || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Valid email and password are required" });
  }

  try {
    const sql = getDb();

    // Rate limit: block after 10 failed login attempts in 15 minutes using a simple in-DB counter
    // We track this by checking recent failed attempts via a lightweight approach
    const ip = (req.headers["x-forwarded-for"] as string || "unknown").split(",")[0].trim();
    const loginKey = `${normalizedEmail}::${ip}`;
    const recentAttempts = await sql`
      SELECT COUNT(*) AS cnt FROM login_attempts
      WHERE identifier = ${loginKey}
        AND created_at > NOW() - INTERVAL '15 minutes'
        AND success = FALSE
    `.catch(() => [{ cnt: 0 }]); // gracefully skip if table doesn't exist yet

    if (Number(recentAttempts[0]?.cnt) >= 10) {
      return res.status(429).json({
        error: "Too many failed login attempts. Please wait 15 minutes before trying again."
      });
    }

    const result = await sql`
      SELECT id, name, email, phone, password, is_admin
      FROM users
      WHERE email = ${normalizedEmail}
    `;

    if (result.length === 0) {
      // Log failed attempt (ignore errors if table not yet created)
      await sql`INSERT INTO login_attempts (identifier, success) VALUES (${loginKey}, FALSE)`.catch(() => {});
      return res.status(401).json({ error: "No account found with this email. Please register first." });
    }

    const user = result[0];
    const valid = await comparePassword(password, user.password);

    if (!valid) {
      await sql`INSERT INTO login_attempts (identifier, success) VALUES (${loginKey}, FALSE)`.catch(() => {});
      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }

    // Clear failed attempts on successful login
    await sql`DELETE FROM login_attempts WHERE identifier = ${loginKey}`.catch(() => {});

    const token = signToken({ id: user.id, email: user.email, isAdmin: user.is_admin });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isAdmin: user.is_admin,
      }
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: err.message });
  }
}

