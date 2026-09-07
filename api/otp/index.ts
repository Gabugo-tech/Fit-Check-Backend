import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { getDb } from "../../lib/db";
import { handleOptions } from "../../lib/cors";
import { sanitizeEmail } from "../../lib/auth";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = req.query.action as string;
  if (action !== "send" && action !== "verify") {
    return res.status(400).json({ error: "Invalid action. Use ?action=send or ?action=verify" });
  }

  // ── SEND ─────────────────────────────────────────────────────────────────
  if (action === "send") {
    const { email } = req.body || {};
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      return res.status(503).json({ error: "Email service is temporarily unavailable. Please try again later." });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      const sql = getDb();

      // Rate limit: max 3 requests per email per 10 minutes
      const recentCount = await sql`
        SELECT COUNT(*) AS cnt FROM otp_codes
        WHERE email = ${normalizedEmail}
          AND created_at > NOW() - INTERVAL '10 minutes'
      `;
      if (Number(recentCount[0]?.cnt) >= 3) {
        return res.status(429).json({
          error: "Too many verification attempts. Please wait 10 minutes before requesting a new code."
        });
      }

      await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND verified = FALSE`;
      await sql`
        INSERT INTO otp_codes (email, code, expires_at)
        VALUES (${normalizedEmail}, ${otp}, ${expiresAt.toISOString()})
      `;

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from: `"FitCheck" <${gmailUser}>`,
        to: normalizedEmail,
        subject: "Your FitCheck verification code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
            <div style="margin-bottom:24px;">
              <span style="background:#E8631A;color:#fff;font-weight:900;font-size:18px;padding:6px 14px;border-radius:6px;">FITCHECK</span>
            </div>
            <h2 style="font-size:20px;font-weight:700;color:#1A1917;margin:0 0 8px;">Verify your email address</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
              Use the code below to complete your FitCheck registration. It expires in <strong>10 minutes</strong>.
            </p>
            <div style="background:#f9fafb;border:2px dashed #e5e7eb;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1A1917;font-family:monospace;">${otp}</span>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              If you did not request this code, you can safely ignore this email.<br/>Do not share this code with anyone.
            </p>
          </div>
        `,
      });

      return res.status(200).json({ ok: true, message: "Verification code sent to your email", email: normalizedEmail });
    } catch (err: any) {
      console.error("OTP send error:", err);
      return res.status(500).json({ error: err.message || "Failed to send verification code." });
    }
  }

  // ── VERIFY ───────────────────────────────────────────────────────────────
  if (action === "verify") {
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
      if (new Date() > new Date(record.expires_at)) {
        await sql`DELETE FROM otp_codes WHERE id = ${record.id}`;
        return res.status(410).json({ error: "This code has expired. Please request a new one." });
      }
      if (record.code !== code.trim()) {
        return res.status(400).json({ error: "Incorrect code. Please check your email and try again." });
      }

      await sql`UPDATE otp_codes SET verified = TRUE WHERE id = ${record.id}`;
      return res.status(200).json({ ok: true, message: "Email verified successfully", email: normalizedEmail });
    } catch (err: any) {
      console.error("OTP verify error:", err);
      return res.status(500).json({ error: err.message || "Verification failed. Please try again." });
    }
  }
}
