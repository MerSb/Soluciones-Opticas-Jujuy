import { Prisma } from "@prisma/client";
import type { SafeUserDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from "../lib/refresh-token.js";
import type { LoginBody, RegisterBody } from "../schemas/auth.schema.js";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
}

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

function toSafeUserDto(user: UserRow): SafeUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
  };
}

export interface Session {
  user: SafeUserDto;
  accessToken: string;
  refreshToken: string;
}

async function issueSession(user: UserRow): Promise<Session> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { raw: refreshToken, hash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return { user: toSafeUserDto(user), accessToken, refreshToken };
}

export async function register(body: RegisterBody): Promise<Session> {
  // Explicit pre-check for a predictable, user-facing message; the
  // unique constraint below is the real guarantee under a race.
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw ApiError.conflict("Ese email ya está registrado.");
  }

  const passwordHash = await hashPassword(body.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        // Never trusts a client-supplied role (§7 of the auth brief) —
        // there is no `role` field in RegisterBody at all, so there is
        // nothing here to ignore; this is always CUSTOMER by the
        // schema's own default.
      },
      select: SAFE_USER_SELECT,
    });
    return issueSession(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw ApiError.conflict("Ese email ya está registrado.");
    }
    throw error;
  }
}

export async function login(body: LoginBody): Promise<Session> {
  const user = await prisma.user.findFirst({
    where: { email: body.email, deletedAt: null },
    select: { ...SAFE_USER_SELECT, passwordHash: true },
  });

  // Deliberately the same generic message whether the email doesn't
  // exist, the account has no password (OAuth-only, not built yet), or
  // the password is wrong (§17 of the auth brief) — never reveals which.
  const genericError = () => ApiError.unauthenticated("Email o contraseña incorrectos.");

  if (!user || !user.passwordHash) {
    throw genericError();
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw genericError();
  }

  return issueSession(user);
}

export async function rotateRefreshToken(rawToken: string): Promise<Session> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  const invalidError = () =>
    ApiError.unauthenticated("Tu sesión expiró. Iniciá sesión nuevamente.");

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw invalidError();
  }

  const user = await prisma.user.findFirst({
    where: { id: existing.userId, deletedAt: null },
    select: SAFE_USER_SELECT,
  });
  if (!user) {
    throw invalidError();
  }

  // Rotation: this token is consumed the instant it's used, whether or
  // not the caller successfully gets a new one — a reused (already-
  // rotated) refresh token is always rejected by the check above on its
  // next attempt.
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(user);
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  // updateMany, not update: a token that's already invalid/unknown
  // (expired, already rotated, or simply absent) makes logout a no-op,
  // not an error — logout must always succeed from the client's
  // perspective.
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
