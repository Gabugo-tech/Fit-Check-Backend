import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { hashPassword, signToken, ADMIN_EMAIL, sanitizeEmail, validatePasswordStrength } from "../../lib/auth";
import { handleOptions } from "../../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, phone, password } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);
  const passwordError = validatePasswordStrength(password);

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!normalizedEmail) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const sql = getDb();

    // Require email OTP to have been verified before account creation
    const otpRows = await sql`
      SELECT id FROM otp_codes
      WHERE email = ${normalizedEmail}
        AND verified = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (otpRows.length === 0) {
      return res.status(403).json({
        error: "Email not verified. Please verify your email address with the code we sent before registering."
      });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hashedPassword = await hashPassword(password);
    const isAdmin = normalizedEmail === ADMIN_EMAIL;

    const result = await sql`
      INSERT INTO users (name, email, phone, password, is_admin, is_verified)
      VALUES (
        ${name.trim()},
        ${normalizedEmail},
        ${typeof phone === "string" && phone.trim() ? phone.trim() : null},
        ${hashedPassword},
        ${isAdmin},
        TRUE
      )
      RETURNING id, name, email, phone, is_admin, created_at
    `;

    const user = result[0];
    const token = signToken({ id: user.id, email: user.email, isAdmin: user.is_admin });

    // Clean up used OTP records for this email
    await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail}`;

    return res.status(201).json({
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
    console.error("Register error:", err);
    return res.status(500).json({ error: err.message });
  }
}

