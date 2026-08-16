// Guards destructive local-only database scripts (db:reset:local) from
// ever running against a non-local DATABASE_URL. Exits non-zero — and
// refuses to run — if DATABASE_URL doesn't point at localhost/127.0.0.1.
// See docs/DATABASE_DESIGN.md "Migration policy".

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Refusing to run a destructive local-only script.");
  process.exit(1);
}

let host;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  console.error(`DATABASE_URL is not a valid URL: ${databaseUrl}`);
  process.exit(1);
}

const allowedLocalHosts = new Set(["localhost", "127.0.0.1"]);

if (!allowedLocalHosts.has(host)) {
  console.error(
    `Refusing to run: DATABASE_URL host "${host}" does not look like a local database.\n` +
      "This command (prisma migrate reset) is destructive and local-development-only.\n" +
      "If this really is local, DATABASE_URL must point at localhost or 127.0.0.1.",
  );
  process.exit(1);
}

console.log(`DATABASE_URL host "${host}" confirmed local — proceeding.`);
