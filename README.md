# FitCheck — Backend

Vercel Serverless Functions API for the FitCheck vintage marketplace.

## Tech Stack
- Node.js + TypeScript
- Neon (Postgres) via `@neondatabase/serverless`
- `bcryptjs` — password hashing
- `jsonwebtoken` — auth tokens
- `resend` — email OTP verification
- `stripe` — payment processing

## API Routes

| Method | Route | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account (requires email OTP) | — |
| POST | `/api/auth/login` | Sign in | — |
| POST | `/api/otp/send` | Send email verification code | — |
| POST | `/api/otp/verify` | Verify email code | — |
| GET | `/api/items` | List all items | — |
| POST | `/api/items` | Create item | Admin |
| GET | `/api/items/:id` | Get single item | — |
| PATCH | `/api/items/:id` | Update item | Admin |
| DELETE | `/api/items/:id` | Delete item | Admin |
| GET | `/api/bids` | List bids | Auth |
| POST | `/api/bids` | Place a bid | Auth |
| GET | `/api/purchases` | List purchases | Auth |
| POST | `/api/checkout/session` | Create Stripe checkout | Auth |
| GET | `/api/wishlist` | Get wishlist | Auth |
| POST | `/api/wishlist` | Toggle wishlist item | Auth |
| GET | `/api/reviews` | Get reviews | — |
| POST | `/api/reviews` | Submit review | Auth |
| GET | `/api/setup` | Health check | — |
| POST | `/api/setup` | Run DB migrations | — |

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in all variables
```

## Database Setup

Run this **once** after deploying to create all tables:

```bash
curl -X POST https://your-backend.vercel.app/api/setup
```

Health check (shows which env vars are set and DB status):
```bash
curl https://your-backend.vercel.app/api/setup
```

## Deployment (Vercel)

1. Push this `backend/` folder as a new GitHub repo
2. Import into Vercel
3. Add all environment variables from `.env.example`
4. Deploy
5. Copy the deployment URL → set as `VITE_API_URL` in the frontend repo
6. Update `ALLOWED_ORIGINS` in Vercel env vars to your frontend URL
7. Run `POST /api/setup` to create the DB tables

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon Postgres connection string |
| `JWT_SECRET` | ✅ | Random string ≥32 chars for signing tokens |
| `ADMIN_EMAIL` | ✅ | Email with admin access |
| `RESEND_API_KEY` | ✅ | Resend key for email OTP |
| `RESEND_FROM_EMAIL` | ✅ | Sender address for OTP emails |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key for payments |
| `APP_URL` | ✅ | Frontend URL for Stripe redirects |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated allowed CORS origins |

## Database Schema

Tables created by `POST /api/setup`:
- `users` — registered accounts
- `items` — marketplace listings
- `bids` — auction bids
- `purchases` — completed orders
- `reviews` — vendor reviews
- `wishlists` — saved items per user
- `otp_codes` — email verification codes (auto-expires in 10 min)
- `login_attempts` — brute-force protection records
