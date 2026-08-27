import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    `API listening on port ${env.PORT} (NODE_ENV=${env.NODE_ENV}, APP_ENV=${env.APP_ENV})`,
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
