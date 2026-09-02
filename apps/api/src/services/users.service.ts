import type { Prisma } from "@prisma/client";
import type { SafeUserDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { UpdateProfileBody } from "../schemas/profile.schema.js";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

export async function getSafeUserById(id: string): Promise<SafeUserDto> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: SAFE_USER_SELECT,
  });
  // A valid access token pointing at a user that no longer exists reads
  // to the client as "your session isn't valid," not "not found" — the
  // account, not a route, is what's missing.
  if (!user) {
    throw ApiError.unauthenticated("Tu sesión expiró. Iniciá sesión nuevamente.");
  }
  return user;
}

export async function updateProfile(id: string, body: UpdateProfileBody): Promise<SafeUserDto> {
  const user = await prisma.user.update({
    where: { id },
    // Only ever these three columns — role, email, auth_provider*,
    // timestamps are never reachable from this function's input type.
    data: {
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
    },
    select: SAFE_USER_SELECT,
  });
  return user;
}
