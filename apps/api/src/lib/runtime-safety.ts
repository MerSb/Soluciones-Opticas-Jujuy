// Startup safety barrier (docs/PRUEBAS_MERCADOPAGO_AISLADO.md §5).
//
// The isolated test environment must never use production credentials or
// the production database, and the real store must never run on test
// payments. None of that can be told from APP_ENV (production itself runs
// with APP_ENV=staging) nor from the Mercado Pago token (test and
// production access tokens both start with "APP_USR"). So the API refuses
// to start unless three independent facts agree:
//
//   1. explicit switches — SANDBOX_MODE and PAYMENTS_MODE (static checks);
//   2. the database itself — a sandbox database carries a marker written
//      once, only on an empty database (readDatabaseMarker / sandbox-init);
//   3. Mercado Pago itself — the account behind the token is (or is not)
//      a test user (GET /users/me).
//
// Pure on purpose: no env import, no global client. server.ts and the
// sandbox scripts pass in what they have; tests pass in fakes. Messages
// never include a secret, a token or a connection string.

export const SANDBOX_DATABASE_MARKER = "soluciones-opticas:sandbox";

/** Hosts of the real storefront. A sandbox must never send buyers there
 * (Checkout Pro return URLs) nor accept requests from there (CORS). */
const PRODUCTION_WEB_HOSTS = [
  "solucionesopticas.com.ar",
  "soluciones-opticas-jujuy-web.vercel.app",
];

export const MERCADOPAGO_USERS_ME_URL = "https://api.mercadopago.com/users/me";
const VERIFY_TIMEOUT_MS = 10_000;

export interface SafetyConfig {
  NODE_ENV: "development" | "test" | "production";
  SANDBOX_MODE: "off" | "on";
  PAYMENTS_MODE: "off" | "test" | "live";
  MERCADOPAGO_ACCESS_TOKEN?: string | undefined;
  MERCADOPAGO_WEBHOOK_SECRET?: string | undefined;
  PUBLIC_WEB_URL?: string | undefined;
  CORS_ORIGINS: readonly string[];
  CLOUDINARY_CLOUD_NAME?: string | undefined;
  CLOUDINARY_API_KEY?: string | undefined;
  CLOUDINARY_API_SECRET?: string | undefined;
  ARCA_MODE: "off" | "mock" | "homologacion";
}

export function isProductionWebHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return PRODUCTION_WEB_HOSTS.some((prod) => host === prod || host.endsWith(`.${prod}`));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Problems that need no network or database: the switches and URLs. */
export function staticSafetyProblems(config: SafetyConfig): string[] {
  const problems: string[] = [];
  const sandbox = config.SANDBOX_MODE === "on";
  const payments = config.PAYMENTS_MODE;

  if (payments !== "off" && !config.MERCADOPAGO_ACCESS_TOKEN) {
    problems.push(`PAYMENTS_MODE=${payments} requiere MERCADOPAGO_ACCESS_TOKEN.`);
  }
  if (payments === "test" && !sandbox && config.NODE_ENV === "production") {
    // A real deployment on test payments would mark orders paid with no
    // money moving.
    problems.push(
      "PAYMENTS_MODE=test solo se permite en el entorno de pruebas (SANDBOX_MODE=on) o en desarrollo local.",
    );
  }

  if (!sandbox) return problems;

  if (payments === "live") {
    problems.push("El entorno de pruebas no acepta PAYMENTS_MODE=live.");
  }
  if (payments === "test") {
    if (!config.MERCADOPAGO_WEBHOOK_SECRET) {
      problems.push("PAYMENTS_MODE=test requiere MERCADOPAGO_WEBHOOK_SECRET.");
    }
    if (!config.PUBLIC_WEB_URL) {
      problems.push("PAYMENTS_MODE=test requiere PUBLIC_WEB_URL (la URL del Preview).");
    }
  }
  if (config.CLOUDINARY_CLOUD_NAME || config.CLOUDINARY_API_KEY || config.CLOUDINARY_API_SECRET) {
    // Production runs with APP_ENV=staging, so uploads from here would land
    // in the real store's folder: no Cloudinary credential at all.
    problems.push("El entorno de pruebas no puede tener variables CLOUDINARY_*.");
  }
  if (config.PUBLIC_WEB_URL) {
    const host = hostOf(config.PUBLIC_WEB_URL);
    if (!host || isProductionWebHost(host)) {
      problems.push("PUBLIC_WEB_URL apunta a la tienda real.");
    } else if (!config.PUBLIC_WEB_URL.startsWith("https://")) {
      problems.push("PUBLIC_WEB_URL debe ser https en el entorno de pruebas.");
    }
  }
  if (config.CORS_ORIGINS.some((origin) => isProductionWebHost(hostOf(origin) ?? origin))) {
    problems.push("CORS_ORIGINS incluye la tienda real.");
  }
  return problems;
}

// ─── Database marker ──────────────────────────────────────────────────

/** Minimal surface of PrismaClient used here (keeps this module pure). */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/** The comment on the current database, or null. A database-level
 * comment is not part of any table, so the Prisma schema (identical to
 * production) is untouched. */
export async function readDatabaseMarker(db: RawQueryClient): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<{ marker: string | null }[]>(
    "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
  );
  return rows[0]?.marker ?? null;
}

/** Number of tables in the public schema (0 = a brand-new database). */
export async function countPublicTables(db: RawQueryClient): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
  );
  return rows[0]?.n ?? 0;
}

export async function writeSandboxMarker(db: RawQueryClient): Promise<void> {
  await db.$executeRawUnsafe(
    `DO $$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), '${SANDBOX_DATABASE_MARKER}'); END $$;`,
  );
}

export type SandboxInitPlan =
  { action: "KEEP" } | { action: "MARK" } | { action: "REFUSE"; reason: string };

/** What `npm run sandbox:init` may do with a database. Only a brand-new
 * database (no tables at all) can become a sandbox: an unmarked database
 * with tables may be production, and is never touched. */
export function planSandboxInit(marker: string | null, publicTables: number): SandboxInitPlan {
  if (marker === SANDBOX_DATABASE_MARKER) return { action: "KEEP" };
  if (marker !== null) {
    return { action: "REFUSE", reason: "La base ya tiene otra marca: no es una base de pruebas." };
  }
  if (publicTables > 0) {
    return {
      action: "REFUSE",
      reason: `La base no tiene la marca de pruebas y ya tiene ${publicTables} tablas: puede ser producción. Solo se prepara una base nueva y vacía.`,
    };
  }
  return { action: "MARK" };
}

export function databaseProblems(config: SafetyConfig, marker: string | null): string[] {
  const marked = marker === SANDBOX_DATABASE_MARKER;
  if (config.SANDBOX_MODE === "on" && !marked) {
    return [
      "La base de datos no tiene la marca de entorno de pruebas: puede ser producción. Prepararla con `npm run sandbox:init` (solo sobre una base vacía).",
    ];
  }
  if (config.SANDBOX_MODE !== "on" && marked) {
    return ["Esta base es del entorno de pruebas: solo puede usarse con SANDBOX_MODE=on."];
  }
  return [];
}

// ─── Mercado Pago account ─────────────────────────────────────────────

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type AccountKind = "TEST" | "REAL";

/** Asks Mercado Pago which account the token belongs to. Throws (and
 * startup is refused) when it cannot tell: fail closed. */
export async function mercadoPagoAccountKind(
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<AccountKind> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(MERCADOPAGO_USERS_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    throw new Error("No se pudo consultar a Mercado Pago para verificar la cuenta del token.");
  }
  if (!response.ok) {
    throw new Error(
      `Mercado Pago rechazó el token al verificar la cuenta (HTTP ${response.status}).`,
    );
  }
  const body = (await response.json().catch(() => null)) as { tags?: unknown } | null;
  if (!body || !Array.isArray(body.tags)) {
    throw new Error("Mercado Pago no informó el tipo de cuenta del token.");
  }
  return body.tags.includes("test_user") ? "TEST" : "REAL";
}

export function paymentAccountProblems(config: SafetyConfig, kind: AccountKind): string[] {
  if (config.PAYMENTS_MODE === "test" && kind !== "TEST") {
    return ["PAYMENTS_MODE=test pero el token pertenece a una cuenta REAL de Mercado Pago."];
  }
  if (config.PAYMENTS_MODE === "live" && kind !== "REAL") {
    return ["PAYMENTS_MODE=live pero el token pertenece a una cuenta de prueba."];
  }
  return [];
}

// ─── Whole check ──────────────────────────────────────────────────────

export interface SafetyDeps {
  db: RawQueryClient;
  fetchImpl: FetchLike;
}

/** Every problem found, in order; empty = safe to start. Never throws:
 * a check that cannot run is itself a problem. */
export async function runtimeSafetyProblems(
  config: SafetyConfig,
  deps: SafetyDeps,
): Promise<string[]> {
  const problems = staticSafetyProblems(config);

  try {
    problems.push(...databaseProblems(config, await readDatabaseMarker(deps.db)));
  } catch {
    problems.push("No se pudo leer la marca de la base de datos.");
  }

  if (config.PAYMENTS_MODE !== "off" && config.MERCADOPAGO_ACCESS_TOKEN) {
    try {
      const kind = await mercadoPagoAccountKind(config.MERCADOPAGO_ACCESS_TOKEN, deps.fetchImpl);
      problems.push(...paymentAccountProblems(config, kind));
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  return problems;
}
