import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_EXPIRES = "7d";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;

  // In production, refuse to start with a weak fallback secret
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is not set. Add it to your Vercel Environment Variables.");
  }

  return "development-secret-change-me";
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { id: string; email: string; isAdmin: boolean }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): { id: string; email: string; isAdmin: boolean } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { id: string; email: string; isAdmin: boolean };
  } catch {
    return null;
  }
}

export function getTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
}

export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(email) ? email : null;
}

export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one uppercase letter and one number";
  }
  return null;
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "nnanwubagabriel@gmail.com";
