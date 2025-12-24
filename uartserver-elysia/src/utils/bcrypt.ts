/**
 * Bcrypt Utility Functions
 * Password hashing and comparison
 */

import bcrypt from 'bcryptjs';

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @param saltRounds - Number of salt rounds (default: 10)
 * @returns Hashed password
 */
export async function hashPassword(
  password: string,
  saltRounds: number = 10
): Promise<string> {
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare a password with its hash
 * @param password - Plain text password
 * @param hash - Bcrypt hash
 * @returns True if password matches hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Verify a password against its hash (alias for comparePassword)
 * @param password - Plain text password
 * @param hash - Bcrypt hash
 * @returns True if password matches hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a salt for bcrypt
 * @param rounds - Number of rounds (default: 10)
 * @returns Salt string
 */
export async function genSalt(rounds: number = 10): Promise<string> {
  return await bcrypt.genSalt(rounds);
}
