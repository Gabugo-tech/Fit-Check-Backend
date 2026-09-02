import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../lib/db";
import { handleOptions } from "../../lib/cors";
import { sanitizeEmail } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, code } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!code || typeof code !== "string" || code.trim().length !== 6) {
    return res.status(400).json({ error: "A valid 6-digit verification code is required" });
  }

  try {
    const sql = getDb();

    // Find the most recent unverified OTP for this email
    const rows = await sql`
      SELECT id, code, expires_at
      FROM otp_codes
      WHERE email = ${normalizedEmail}
        AND verified = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: "No verification code found. Please request a new one." });
    }

    const record = rows[0];

    // Check expiry
    if (new Date() > new Date(record.expires_at)) {
      await sql`DELETE FROM otp_codes WHERE id = ${record.id}`;
      return res.status(410).json({ error: "This code has expired. Please request a new one." });
    }

    // Check code match
    if (record.code !== code.trim()) {
      return res.status(400).json({ error: "Incorrect code. Please check your email and try again." });
    }

    // Mark as verified
    await sql`UPDATE otp_codes SET verified = TRUE WHERE id = ${record.id}`;

    return res.status(200).json({ ok: true, message: "Email verified successfully", email: normalizedEmail });
  } catch (err: any) {
    console.error("OTP verify error:", err);
    return res.status(500).json({ error: err.message || "Verification failed. Please try again." });
  }
}

