// The only way an ADMIN account is ever created in this project: a
// person registers a normal account through the public, customer-facing
// `POST /api/auth/register` flow (choosing their own real password —
// this script never sets or knows a password), then a trusted operator
// runs this script to flip that one existing user's role. There is no
// admin-registration endpoint, no seeded admin user, and no shipped
// default password anywhere in this repository — see
// docs/adr/0021-admin-catalog-management.md "Admin bootstrap".
//
// Usage: node --env-file=.env scripts/promote-to-admin.mjs someone@example.com
// (or: npm run admin:promote -- someone@example.com)
//
// Safe to run against local, staging, or production — it only ever
// updates one existing row's `role` column by email; it never creates,
// deletes, or resets anything, so it needs none of assert-local-db.mjs's
// destructive-action guard.

import { PrismaClient } from "@prisma/client";

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/promote-to-admin.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, deletedAt: true },
  });

  if (!user) {
    console.error(
      `No user found with email "${email}". Register the account first (POST /api/auth/register), then re-run this script.`,
    );
    process.exit(1);
  }

  if (user.deletedAt) {
    console.error(`User "${email}" is soft-deleted — refusing to promote a deactivated account.`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`"${email}" is already ADMIN — nothing to do.`);
    process.exit(0);
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  console.log(`"${email}" promoted to ADMIN.`);
} finally {
  await prisma.$disconnect();
}
