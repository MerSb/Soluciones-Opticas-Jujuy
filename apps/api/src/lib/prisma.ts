import { PrismaClient } from "@prisma/client";

// Singleton — a fresh PrismaClient per request would exhaust the
// database's connection pool under any real load. In development,
// stash it on `globalThis` so a hot-reload (tsx --watch) doesn't create
// a second pool alongside the one from the previous process instance.
declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
