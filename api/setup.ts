import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { initDB } from "../lib/db";
import { handleOptions } from "../lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const dbUrl = process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_URL_NO_SSL
    || process.env.POSTGRES_PRISMA_URL;

  // GET â†’ health check
  if (req.method === "GET") {
    const dbVars: Record<string, string> = {
      DATABASE_URL:       process.env.DATABASE_URL       ? `âœ… set` : "âŒ not set",
      POSTGRES_URL:       process.env.POSTGRES_URL       ? `âœ… set` : "âŒ not set",
      POSTGRES_URL_NO_SSL:process.env.POSTGRES_URL_NO_SSL? `âœ… set` : "âŒ not set",
      POSTGRES_PRISMA_URL:process.env.POSTGRES_PRISMA_URL? `âœ… set` : "âŒ not set",
    };

    let dbStatus = "âŒ no DB URL found";
    let dbError: string | null = null;

    if (dbUrl) {
      try {
        const sql = neon(dbUrl);
        const result = await sql`SELECT 1 AS ok`;
        dbStatus = result[0]?.ok === 1 ? "âœ… connected" : "âš ï¸ unexpected result";
      } catch (err: any) {
        dbStatus = "âŒ connection failed";
        dbError = err.message;
      }
    }

    return res.status(200).json({
      db: { status: dbStatus, error: dbError, vars: dbVars },
      resend: {
        apiKey:    process.env.RESEND_API_KEY    ? "âœ… set" : "âŒ not set",
        fromEmail: process.env.RESEND_FROM_EMAIL ? `âœ… ${process.env.RESEND_FROM_EMAIL}` : "âŒ not set",
      },
      jwt: process.env.JWT_SECRET ? "âœ… set" : "âŒ not set",
    });
  }

  // POST â†’ run DB migrations
  if (req.method === "POST") {
    try {
      const result = await initDB();
      return res.status(200).json(result);
    } catch (err: any) {
      console.error("DB setup error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Use GET to check health or POST to run migrations." });
}

