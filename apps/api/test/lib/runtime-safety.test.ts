import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import {
  countPublicTables,
  databaseProblems,
  isProductionWebHost,
  mercadoPagoAccountKind,
  MERCADOPAGO_USERS_ME_URL,
  paymentAccountProblems,
  planSandboxInit,
  readDatabaseMarker,
  runtimeSafetyProblems,
  SANDBOX_DATABASE_MARKER,
  staticSafetyProblems,
  writeSandboxMarker,
  type FetchLike,
  type SafetyConfig,
} from "../../src/lib/runtime-safety.js";

// The startup barrier (docs/PRUEBAS_MERCADOPAGO_AISLADO.md §5): the
// isolated test environment never runs on production credentials or the
// production database, and the real store never runs on test payments.

const TOKEN = "APP_USR-0000000000000000-000000-ffffffffffffffffffffffffffffffff-000000000";

/** Production as it is today: nothing switched on. */
const PRODUCTION: SafetyConfig = {
  NODE_ENV: "production",
  SANDBOX_MODE: "off",
  PAYMENTS_MODE: "off",
  CORS_ORIGINS: ["https://www.solucionesopticas.com.ar"],
  ARCA_MODE: "off",
};

/** The isolated test environment, correctly configured. */
const SANDBOX: SafetyConfig = {
  NODE_ENV: "production",
  SANDBOX_MODE: "on",
  PAYMENTS_MODE: "test",
  MERCADOPAGO_ACCESS_TOKEN: TOKEN,
  MERCADOPAGO_WEBHOOK_SECRET: "webhook-secret",
  PUBLIC_WEB_URL: "https://pruebas-git-rama.vercel.app",
  CORS_ORIGINS: ["https://pruebas-git-rama.vercel.app"],
  ARCA_MODE: "off",
};

const withTags =
  (tags: unknown, status = 200): FetchLike =>
  async () => ({ ok: status < 400, status, json: async () => ({ id: 1, tags }) });

describe("static switches", () => {
  it("production as it is today starts", () => {
    expect(staticSafetyProblems(PRODUCTION)).toEqual([]);
  });

  it("the sandbox, correctly configured, starts", () => {
    expect(staticSafetyProblems(SANDBOX)).toEqual([]);
  });

  it("test payments are refused on a real deployment without the sandbox switch", () => {
    const problems = staticSafetyProblems({
      ...PRODUCTION,
      PAYMENTS_MODE: "test",
      MERCADOPAGO_ACCESS_TOKEN: TOKEN,
    });
    expect(problems.join(" ")).toMatch(/solo se permite en el entorno de pruebas/);
  });

  it("test payments are allowed in local development", () => {
    expect(
      staticSafetyProblems({
        ...PRODUCTION,
        NODE_ENV: "development",
        PAYMENTS_MODE: "test",
        MERCADOPAGO_ACCESS_TOKEN: TOKEN,
      }),
    ).toEqual([]);
  });

  it("payments switched on without a token are refused", () => {
    expect(staticSafetyProblems({ ...PRODUCTION, PAYMENTS_MODE: "live" }).join(" ")).toMatch(
      /requiere MERCADOPAGO_ACCESS_TOKEN/,
    );
  });

  it("the sandbox refuses live payments", () => {
    expect(staticSafetyProblems({ ...SANDBOX, PAYMENTS_MODE: "live" }).join(" ")).toMatch(
      /no acepta PAYMENTS_MODE=live/,
    );
  });

  it("the sandbox in test mode needs the webhook secret and its own web URL", () => {
    const problems = staticSafetyProblems({
      ...SANDBOX,
      MERCADOPAGO_WEBHOOK_SECRET: undefined,
      PUBLIC_WEB_URL: undefined,
    });
    expect(problems).toHaveLength(2);
  });

  it.each(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const)(
    "the sandbox refuses %s, even alone",
    (name) => {
      expect(staticSafetyProblems({ ...SANDBOX, [name]: "x" }).join(" ")).toMatch(/CLOUDINARY_/);
    },
  );

  it.each([
    "https://www.solucionesopticas.com.ar",
    "https://solucionesopticas.com.ar",
    "https://soluciones-opticas-jujuy-web.vercel.app",
  ])("the sandbox never returns buyers to the real store (%s)", (url) => {
    expect(staticSafetyProblems({ ...SANDBOX, PUBLIC_WEB_URL: url }).join(" ")).toMatch(
      /tienda real/,
    );
    expect(staticSafetyProblems({ ...SANDBOX, CORS_ORIGINS: [url] }).join(" ")).toMatch(
      /tienda real/,
    );
  });

  it("the sandbox web URL must be https", () => {
    expect(
      staticSafetyProblems({ ...SANDBOX, PUBLIC_WEB_URL: "http://pruebas.example.test" }).join(" "),
    ).toMatch(/https/);
  });

  it("recognizes the real store's hosts, not look-alikes", () => {
    expect(isProductionWebHost("WWW.SolucionesOpticas.com.ar")).toBe(true);
    expect(isProductionWebHost("solucionesopticas.com.ar.")).toBe(true);
    expect(isProductionWebHost("solucionesopticas.com.ar.example.test")).toBe(false);
    expect(isProductionWebHost("no-solucionesopticas.com.ar")).toBe(false);
  });
});

describe("database marker", () => {
  it("the sandbox needs the marker; production must not have it", () => {
    expect(databaseProblems(SANDBOX, SANDBOX_DATABASE_MARKER)).toEqual([]);
    expect(databaseProblems(SANDBOX, null).join(" ")).toMatch(/puede ser producción/);
    expect(databaseProblems(SANDBOX, "otra cosa")).toHaveLength(1);
    expect(databaseProblems(PRODUCTION, null)).toEqual([]);
    expect(databaseProblems(PRODUCTION, SANDBOX_DATABASE_MARKER).join(" ")).toMatch(
      /SANDBOX_MODE=on/,
    );
  });

  it("sandbox:init marks only a brand-new database and never touches one with tables", () => {
    expect(planSandboxInit(null, 0)).toEqual({ action: "MARK" });
    expect(planSandboxInit(SANDBOX_DATABASE_MARKER, 30)).toEqual({ action: "KEEP" });
    expect(planSandboxInit(null, 1)).toMatchObject({ action: "REFUSE" });
    expect(planSandboxInit(null, 30)).toMatchObject({ action: "REFUSE" });
    expect(planSandboxInit("otra cosa", 0)).toMatchObject({ action: "REFUSE" });
  });

  describe("against a real Postgres", () => {
    let before: string | null = null;
    afterAll(async () => {
      // Leave the database exactly as it was.
      await prisma.$executeRawUnsafe(
        before === null
          ? "DO $$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS NULL', current_database()); END $$;"
          : `DO $$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), '${before.replaceAll("'", "''")}'); END $$;`,
      );
    });

    it("writes and reads the marker as a database comment, outside every table", async () => {
      before = await readDatabaseMarker(prisma);
      const tables = await countPublicTables(prisma);
      expect(tables).toBeGreaterThan(0);
      await writeSandboxMarker(prisma);
      expect(await readDatabaseMarker(prisma)).toBe(SANDBOX_DATABASE_MARKER);
      expect(await countPublicTables(prisma)).toBe(tables);
    });
  });
});

describe("Mercado Pago account behind the token", () => {
  it("asks /users/me with the token as a bearer and reads the test_user tag", async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ tags: ["normal", "test_user"] }) };
    };
    expect(await mercadoPagoAccountKind(TOKEN, fetchImpl)).toBe("TEST");
    expect(calls).toEqual([{ url: MERCADOPAGO_USERS_ME_URL, auth: `Bearer ${TOKEN}` }]);
    expect(await mercadoPagoAccountKind(TOKEN, withTags(["normal"]))).toBe("REAL");
  });

  it("fails closed when Mercado Pago cannot tell, never echoing the token", async () => {
    const failures: FetchLike[] = [
      withTags(["test_user"], 401),
      withTags(undefined),
      async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error("x")) }),
      async () => {
        throw new Error(`network down for ${TOKEN}`);
      },
    ];
    for (const fetchImpl of failures) {
      const error = await mercadoPagoAccountKind(TOKEN, fetchImpl).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });

  it("test mode needs a test account; live mode needs a real one", () => {
    expect(paymentAccountProblems(SANDBOX, "TEST")).toEqual([]);
    expect(paymentAccountProblems(SANDBOX, "REAL").join(" ")).toMatch(/cuenta REAL/);
    const live = { ...PRODUCTION, PAYMENTS_MODE: "live" as const, MERCADOPAGO_ACCESS_TOKEN: TOKEN };
    expect(paymentAccountProblems(live, "REAL")).toEqual([]);
    expect(paymentAccountProblems(live, "TEST").join(" ")).toMatch(/cuenta de prueba/);
  });
});

describe("whole startup check", () => {
  const markerDb = (marker: string | null) => ({
    $queryRawUnsafe: async <T>(query: string) =>
      (query.includes("shobj_description") ? [{ marker }] : [{ n: 0 }]) as T,
    $executeRawUnsafe: async () => 0,
  });

  it("a correct sandbox starts", async () => {
    const problems = await runtimeSafetyProblems(SANDBOX, {
      db: markerDb(SANDBOX_DATABASE_MARKER),
      fetchImpl: withTags(["test_user"]),
    });
    expect(problems).toEqual([]);
  });

  it("the sandbox pointed at an unmarked database (production) does not start", async () => {
    const problems = await runtimeSafetyProblems(SANDBOX, {
      db: markerDb(null),
      fetchImpl: withTags(["test_user"]),
    });
    expect(problems.join(" ")).toMatch(/puede ser producción/);
  });

  it("the sandbox with a production Mercado Pago token does not start", async () => {
    const problems = await runtimeSafetyProblems(SANDBOX, {
      db: markerDb(SANDBOX_DATABASE_MARKER),
      fetchImpl: withTags(["normal"]),
    });
    expect(problems.join(" ")).toMatch(/cuenta REAL/);
  });

  it("does not start when the database cannot be read or Mercado Pago does not answer", async () => {
    const problems = await runtimeSafetyProblems(SANDBOX, {
      db: {
        $queryRawUnsafe: async () => Promise.reject(new Error("down")),
        $executeRawUnsafe: async () => 0,
      },
      fetchImpl: async () => Promise.reject(new Error("down")),
    });
    expect(problems).toHaveLength(2);
  });

  it("production as it is today never calls Mercado Pago at startup", async () => {
    let called = false;
    const problems = await runtimeSafetyProblems(PRODUCTION, {
      db: markerDb(null),
      fetchImpl: async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({ tags: [] }) };
      },
    });
    expect(problems).toEqual([]);
    expect(called).toBe(false);
  });
});
