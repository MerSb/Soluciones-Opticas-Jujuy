import bcrypt from "bcryptjs";

// Pure-JS bcrypt (no native compilation) — avoids build-toolchain
// fragility across this repo's environments (this sandbox, Railway's
// Nixpacks build). 12 rounds: bcrypt's own recommended floor for
// interactive login as of today, without being slow enough to hurt
// register/login latency noticeably.
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
