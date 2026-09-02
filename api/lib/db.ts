import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_URL_NO_SSL
    || process.env.POSTGRES_PRISMA_URL;

  if (!url) {
    throw new Error(
      "No database URL found. Set DATABASE_URL, POSTGRES_URL, or POSTGRES_URL_NO_SSL in Vercel Environment Variables."
    );
  }
  if (!_sql) {
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Run once to create all tables.
 */
export async function initDB() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      phone       TEXT,
      password    TEXT NOT NULL,
      is_admin    BOOLEAN DEFAULT FALSE,
      is_verified BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS items (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title             TEXT NOT NULL,
      description       TEXT,
      category          TEXT,
      era               TEXT,
      condition         TEXT,
      size              TEXT,
      seller_id         TEXT,
      seller_name       TEXT,
      seller_avatar     TEXT,
      market_name       TEXT,
      image_url         TEXT,
      starting_bid      NUMERIC DEFAULT 0,
      current_bid       NUMERIC DEFAULT 0,
      buy_price         NUMERIC,
      bids_count        INTEGER DEFAULT 0,
      highest_bidder    TEXT,
      bidding_ends_at   TIMESTAMPTZ,
      is_sold           BOOLEAN DEFAULT FALSE,
      bid_dropped       BOOLEAN DEFAULT FALSE,
      bid_dropped_reason TEXT,
      tags              TEXT[],
      measurements      JSONB,
      materials         TEXT[],
      history           TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bids (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id      UUID REFERENCES items(id) ON DELETE CASCADE,
      item_title   TEXT,
      bidder_name  TEXT NOT NULL,
      bidder_email TEXT,
      amount       NUMERIC NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS purchases (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id     UUID REFERENCES items(id) ON DELETE CASCADE,
      buyer_email TEXT NOT NULL,
      buyer_name  TEXT,
      amount      NUMERIC NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id     TEXT NOT NULL,
      vendor_name   TEXT,
      item_title    TEXT,
      customer_name TEXT NOT NULL,
      rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
      comment       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS wishlists (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT NOT NULL,
      item_id    UUID REFERENCES items(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_email, item_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      identifier  TEXT NOT NULL,
      success     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS login_attempts_identifier_idx ON login_attempts (identifier, created_at)
  `;

  // Drop and recreate otp_codes to ensure it uses email (not phone) column.
  // Safe to drop — OTP records are transient and expire in 10 minutes.
  await sql`DROP TABLE IF EXISTS otp_codes`;

  await sql`
    CREATE TABLE otp_codes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT NOT NULL,
      code        TEXT NOT NULL,
      verified    BOOLEAN DEFAULT FALSE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email)
  `;

  return { ok: true, message: "All tables created/migrated successfully" };
}
