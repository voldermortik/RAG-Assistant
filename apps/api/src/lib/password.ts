/**
 * bcrypt password helpers (12 rounds)
 */
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  // Reject seed hashes (from db seed script) — they are not bcrypt
  if (hash.startsWith("seed:")) {
    return false;
  }
  return bcrypt.compare(plaintext, hash);
}
