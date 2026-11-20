// Prepares the isolated test environment's database — and nothing else
// (docs/PRUEBAS_MERCADOPAGO_AISLADO.md §5).
//
//   SANDBOX_MODE=on DATABASE_URL=<sandbox> npm run sandbox:init -- --confirmo-base-de-pruebas
//
// 1. Refuses unless SANDBOX_MODE=on and the confirmation flag are given.
// 2. Reads the database: a sandbox already marked is kept; a brand-new
//    database (no tables) is marked; anything else — an unmarked database
//    with tables, which may be production — is refused untouched.
// 3. Applies the migrations (prisma migrate deploy).
// 4. Loads the fictional [DEMO] catalog (prisma/seed-staging.ts, which
//    checks the marker again on its own).
//
// Idempotent: safe as the sandbox service's pre-deploy command. Never
// prints the connection string.

import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  countPublicTables,
  planSandboxInit,
  readDatabaseMarker,
  SANDBOX_DATABASE_MARKER,
  writeSandboxMarker,
} from "../apps/api/src/lib/runtime-safety.js";

const CONFIRM_FLAG = "--confirmo-base-de-pruebas";

function fail(message: string): never {
  console.error(`[sandbox:init] ${message}`);
  process.exit(1);
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true, env: process.env });
  if (result.status !== 0) fail(`Falló: ${command} ${args.join(" ")}`);
}

async function main() {
  if (process.env.SANDBOX_MODE !== "on") fail("Solo corre con SANDBOX_MODE=on.");
  if (!process.argv.includes(CONFIRM_FLAG))
    fail(`Falta la confirmación explícita ${CONFIRM_FLAG}.`);
  if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL.");

  const prisma = new PrismaClient();
  try {
    const marker = await readDatabaseMarker(prisma);
    const tables = await countPublicTables(prisma);
    const plan = planSandboxInit(marker, tables);
    if (plan.action === "REFUSE") fail(`No se toca esta base. ${plan.reason}`);
    if (plan.action === "MARK") {
      await writeSandboxMarker(prisma);
      if ((await readDatabaseMarker(prisma)) !== SANDBOX_DATABASE_MARKER) {
        fail("No se pudo escribir la marca de pruebas en la base.");
      }
      console.log("[sandbox:init] Base nueva y vacía: marcada como entorno de pruebas.");
    } else {
      console.log("[sandbox:init] La base ya es del entorno de pruebas.");
    }
  } finally {
    await prisma.$disconnect();
  }

  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["tsx", "prisma/seed-staging.ts"]);
  console.log("[sandbox:init] Listo: migraciones aplicadas y catálogo [DEMO] cargado.");
}

main().catch((error: unknown) => fail((error as Error).name));
