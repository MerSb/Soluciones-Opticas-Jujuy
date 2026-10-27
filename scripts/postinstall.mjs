// Root postinstall: generate the Prisma client for the API.
//
// Skipped inside Vercel builds (VERCEL=1, set by Vercel itself). The web
// doesn't use Prisma, and the project's install command already runs
// `npm install --ignore-scripts`; but apps/web/middleware.ts makes Vercel
// build a function, and that builder runs its own plain `npm install`,
// which reached this script without the Prisma CLI installed and failed
// the deploy (docs/RUTAS_HTTP_VERCEL.md). Railway and local installs
// don't set VERCEL, so they keep generating the client as before.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL === "1") {
  console.log("postinstall: Vercel build, Prisma client not needed — skipped.");
  process.exit(0);
}

const result = spawnSync("prisma", ["generate"], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
