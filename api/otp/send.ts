import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { getDb } from "../../lib/db";
import { handleOptions } from "../../lib/cors";
import { sanitizeEmail } from "../../lib/auth";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(503).json({
      error: "Email service is temporarily unavailable. Please try again later.",
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    const sql = getDb();

    // Rate limit: max 3 OTP requests per email per 10 minutes
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

    // Clear any existing unused OTPs for this email
    await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND verified = FALSE`;

    // Store new OTP
    await sql`
      INSERT INTO otp_codes (email, code, expires_at)
      VALUES (${normalizedEmail}, ${otp}, ${expiresAt.toISOString()})
    `;

    // Send email via Resend
    const resend = new Resend(resendKey);
    const fromAddress = process.env.RESEND_FROM_EMAIL || "FitCheck <onboarding@resend.dev>";

    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: normalizedEmail,
      subject: "Your FitCheck verification code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#F68B1E;color:#fff;font-weight:900;font-size:18px;padding:6px 14px;border-radius:6px;letter-spacing:1px;">FITCHECK</span>
          </div>
          <h2 style="font-size:20px;font-weight:700;color:#1C1A17;margin:0 0 8px;">Verify your email address</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
            Use the code below to complete your FitCheck registration. It expires in <strong>10 minutes</strong>.
          </p>
          <div style="background:#f9fafb;border:2px dashed #e5e7eb;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1C1A17;font-family:monospace;">${otp}</span>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            If you did not request this code, you can safely ignore this email.<br/>
            Do not share this code with anyone.
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error("Resend error:", sendError);
      return res.status(400).json({ error: `Email delivery failed: ${sendError.message}` });
    }

    return res.status(200).json({ ok: true, message: "Verification code sent to your email", email: normalizedEmail });
  } catch (err: any) {
    console.error("OTP send error:", err);
    return res.status(500).json({ error: err.message || "Failed to send verification code. Please try again." });
  }
}

