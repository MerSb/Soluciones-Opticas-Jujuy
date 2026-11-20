import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { runtimeSafetyProblems } from "./lib/runtime-safety.js";

// Startup barrier (lib/runtime-safety.ts): nothing is served until the
// configuration, the database marker and the Mercado Pago account agree.
// Fails closed — any problem, or a check that cannot run, stops the
// process before the port opens.
const problems = await runtimeSafetyProblems(env, { db: prisma, fetchImpl: fetch });
if (problems.length > 0) {
  for (const problem of problems) console.error(`[startup] Configuración insegura: ${problem}`);
  console.error("[startup] La API no arranca. Ver docs/PRUEBAS_MERCADOPAGO_AISLADO.md.");
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    `API listening on port ${env.PORT} (NODE_ENV=${env.NODE_ENV}, APP_ENV=${env.APP_ENV}, ` +
      `SANDBOX_MODE=${env.SANDBOX_MODE}, PAYMENTS_MODE=${env.PAYMENTS_MODE}, ARCA_MODE=${env.ARCA_MODE})`,
  );
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
