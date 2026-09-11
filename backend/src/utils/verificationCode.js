// src/utils/verificationCode.js
// Cryptographically secure verification-code generation and hashing for the
// clinic email-verification flow. Codes are NEVER stored or logged in plain
// text — only a bcrypt hash is persisted, and comparison is constant-time via
// bcrypt.compare. All tunables are read from the environment with safe defaults.

import crypto from "crypto";
import bcrypt from "bcryptjs";

function intFromEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isNaN(raw)) return fallback;
  return Math.min(Math.max(raw, min), max);
}

// Verification policy (override via .env).
export const CODE_LENGTH = intFromEnv("VERIFICATION_CODE_LENGTH", 6, { min: 4, max: 10 });
export const CODE_TTL_MINUTES = intFromEnv("VERIFICATION_CODE_TTL_MINUTES", 10, { min: 1, max: 60 });
export const MAX_VERIFY_ATTEMPTS = intFromEnv("VERIFICATION_MAX_ATTEMPTS", 5, { min: 1, max: 20 });
export const RESEND_COOLDOWN_SECONDS = intFromEnv("VERIFICATION_RESEND_COOLDOWN_SECONDS", 60, { min: 10, max: 3600 });
export const MAX_RESENDS = intFromEnv("VERIFICATION_MAX_RESENDS", 3, { min: 1, max: 20 });
// How long the whole pending registration survives before it is auto-purged.
export const PENDING_TTL_MINUTES = intFromEnv("VERIFICATION_PENDING_TTL_MINUTES", 60, { min: 10, max: 1440 });

const BCRYPT_ROUNDS = 10;

// A uniformly-distributed, crypto-secure numeric code (e.g. "042917").
// crypto.randomInt avoids modulo bias present in naive Math.random approaches.
export function generateCode(length = CODE_LENGTH) {
  const upperBound = 10 ** length;
  const n = crypto.randomInt(0, upperBound);
  return String(n).padStart(length, "0");
}

export async function hashCode(code) {
  return bcrypt.hash(String(code), BCRYPT_ROUNDS);
}

export async function compareCode(code, hash) {
  if (!code || !hash) return false;
  try {
    return await bcrypt.compare(String(code), String(hash));
  } catch {
    return false;
  }
}

export function codeExpiryDate(from = new Date()) {
  return new Date(from.getTime() + CODE_TTL_MINUTES * 60 * 1000);
}

export function pendingPurgeDate(from = new Date()) {
  return new Date(from.getTime() + PENDING_TTL_MINUTES * 60 * 1000);
}

// Accepts only a string of exactly CODE_LENGTH digits — used to reject
// malformed input before touching the database or bcrypt.
export function isWellFormedCode(input, length = CODE_LENGTH) {
  return typeof input === "string" && new RegExp(`^\\d{${length}}$`).test(input.trim());
}
