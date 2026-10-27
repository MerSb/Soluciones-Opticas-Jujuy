// Normalization of frame shapes (docs/CATALOGO_NORMALIZACION.md).
//
//   preview  → HTML (to read) + CSV (to decide) of every frame whose shape
//              is not official: current, proposed, reason, confidence and
//              status. Every row starts "pendiente"; approval is explicit
//              (edit the CSV, or --aprobar-alta-confianza).
//   plan     → from the approved rows only: aplicar.sql (one transaction;
//              each UPDATE only touches `shape`, and only while it still
//              holds the value seen in the preview — idempotent, a re-run
//              changes nothing), revertir.sql and registro.json.
//
// The SQL is read before it is run: on an isolated copy with psql; on
// production only with explicit authorization. Nothing here writes to a
// database. Product names are never changed; a shape is never inferred
// from the name (the name only flags rows for review).
//
//   npx tsx scripts/catalog-shapes.ts preview (--auditoria <archivo> | --base) --salida <dir> [--aprobar-alta-confianza]
//   npx tsx scripts/catalog-shapes.ts plan --decisiones <decisiones.csv> --salida <dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FRAME_SHAPES,
  canonicalShape,
  isOfficialShape,
  normalizeShapeText,
} from "../src/lib/frame-shapes.js";

export interface CatalogFrame {
  id: string;
  name: string;
  brand: string;
  category: string;
  deleted: boolean;
  shape: string | null;
}

export type Confidence = "alta" | "revisión";
export type Decision = "pendiente" | "aprobado" | "rechazado";

export interface PreviewRow extends CatalogFrame {
  proposed: string | null;
  reason: string;
  confidence: Confidence;
  nameSuggests: string[];
  status: Decision;
}

// Words in a name that suggest a shape — used ONLY to flag a contradiction
// for review, never to propose a shape.
const NAME_HINTS: Record<string, RegExp> = Object.fromEntries(
  FRAME_SHAPES.map((definition) => [
    definition.shape,
    new RegExp(
      `\\b(${[definition.shape, ...definition.synonyms]
        .map((word) => normalizeShapeText(word).replace(/ /g, "\\s"))
        .join("|")})`,
    ),
  ]),
);

export function nameSuggests(name: string): string[] {
  const text = normalizeShapeText(name);
  return Object.entries(NAME_HINTS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([shape]) => shape);
}

/** The rules, explicit and in order. Only an unambiguous dictionary match
 * of the CURRENT shape is "alta"; everything else goes to review. */
export function classify(frame: CatalogFrame): PreviewRow | null {
  const hints = nameSuggests(frame.name);
  const base = { ...frame, nameSuggests: hints, status: "pendiente" as Decision };
  if (frame.shape !== null && isOfficialShape(frame.shape)) {
    // Already official: only listed when the name contradicts it.
    if (hints.length > 0 && !hints.includes(frame.shape)) {
      return {
        ...base,
        proposed: null,
        reason: `el nombre sugiere ${hints.join(" / ")} pero la forma es ${frame.shape}: revisar`,
        confidence: "revisión",
      };
    }
    return null;
  }
  if (frame.shape === null || frame.shape.trim() === "") {
    return {
      ...base,
      proposed: null,
      reason: "sin forma cargada: elegir a mano (no se deduce del nombre)",
      confidence: "revisión",
    };
  }
  const official = /[,/+]| y /.test(frame.shape) ? null : canonicalShape(frame.shape);
  if (official) {
    const sameWord = normalizeShapeText(official) === normalizeShapeText(frame.shape);
    return {
      ...base,
      proposed: official,
      reason: sameWord
        ? "difiere solo en mayúsculas, tildes o espacios"
        : `«${frame.shape}» es sinónimo registrado de ${official}`,
      confidence: "alta",
    };
  }
  return {
    ...base,
    proposed: null,
    reason: /[,/+]| y /.test(frame.shape)
      ? "combina varias formas: elegir una"
      : "valor que no está en el diccionario: elegir a mano",
    confidence: "revisión",
  };
}

// ─── CSV ────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  "id",
  "producto",
  "marca",
  "categoria",
  "estado_producto",
  "forma_actual",
  "forma_propuesta",
  "motivo",
  "confianza",
  "el_nombre_sugiere",
  "decision",
];

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function toCsv(rows: PreviewRow[]): string {
  return [
    CSV_HEADER.join(";"),
    ...rows.map((row) =>
      [
        row.id,
        row.name,
        row.brand,
        row.category,
        row.deleted ? "eliminado" : "activo",
        row.shape ?? "",
        row.proposed ?? "",
        row.reason,
        row.confidence,
        row.nameSuggests.join(" / "),
        row.status,
      ]
        .map(csvCell)
        .join(";"),
    ),
  ].join("\n");
}

export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ";") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

// ─── HTML preview ───────────────────────────────────────────────────────

const html = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  );

export function toHtml(
  rows: PreviewRow[],
  summary: Record<string, number>,
  source: string,
): string {
  const body = rows
    .map(
      (row) => `<tr class="${row.confidence === "alta" ? "alta" : "revision"}">
<td><code>${html(row.id)}</code></td><td>${html(row.name)}<br><small>${html(row.brand)} · ${html(row.category)}${row.deleted ? " · eliminado" : ""}</small></td>
<td>${html(row.shape ?? "—")}</td><td><strong>${html(row.proposed ?? "—")}</strong></td>
<td>${html(row.reason)}${row.nameSuggests.length ? `<br><small>El nombre sugiere: ${html(row.nameSuggests.join(" / "))}</small>` : ""}</td>
<td>${row.confidence}</td><td>${row.status}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vista previa de formas</title><style>
body{font-family:system-ui,sans-serif;margin:16px;color:#1b2a33}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid #d9e1e5;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3f5}
tr.alta td:nth-child(4){color:#0f6b4a}tr.revision td:nth-child(4){color:#8a5a00}small{color:#5b6b73}
.resumen{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.resumen div{background:#eef3f5;padding:8px 12px;border-radius:6px}
</style></head><body><h1>Vista previa de normalización de formas</h1>
<p>Fuente: ${html(source)}. Nada se aplica sin aprobación explícita: decidir en <code>decisiones.csv</code> (columna <code>decision</code>: aprobado / rechazado / pendiente).</p>
<div class="resumen">${Object.entries(summary)
    .map(([key, value]) => `<div><strong>${value}</strong> ${html(key)}</div>`)
    .join("")}</div>
<div style="overflow-x:auto"><table><thead><tr><th>Id</th><th>Producto</th><th>Forma actual</th><th>Forma propuesta</th><th>Motivo</th><th>Confianza</th><th>Estado</th></tr></thead>
<tbody>${body}</tbody></table></div></body></html>`;
}

// ─── Plan (SQL) ─────────────────────────────────────────────────────────

const sqlText = (value: string | null) =>
  value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;

export interface PlannedChange {
  id: string;
  name: string;
  from: string | null;
  to: string;
}

/** Approved rows → changes. Refuses anything not explicitly approved or
 * not an official shape; ids must be unique. */
export function planChanges(decisions: Record<string, string>[]): {
  changes: PlannedChange[];
  skipped: { id: string; reason: string }[];
} {
  const changes: PlannedChange[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const row of decisions) {
    const id = row.id?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      skipped.push({ id, reason: "id inválido" });
      continue;
    }
    if (seen.has(id)) {
      skipped.push({ id, reason: "id repetido" });
      continue;
    }
    seen.add(id);
    const decision = (row.decision ?? "").trim().toLowerCase();
    if (decision !== "aprobado") {
      skipped.push({ id, reason: decision === "rechazado" ? "rechazado" : "no aprobado" });
      continue;
    }
    const to = (row.forma_propuesta ?? "").trim();
    if (!isOfficialShape(to)) {
      skipped.push({ id, reason: `«${to}» no es una forma oficial` });
      continue;
    }
    const from = (row.forma_actual ?? "").trim() || null;
    if (from === to) {
      skipped.push({ id, reason: "ya tiene esa forma" });
      continue;
    }
    changes.push({ id, name: row.producto ?? "", from, to });
  }
  return { changes, skipped };
}

export function applySql(changes: PlannedChange[], runId: string): string {
  return [
    `-- Normalización de formas, corrida ${runId}. Solo cambia products.shape de las filas`,
    "-- aprobadas, y solo si todavía tienen el valor visto en la vista previa (idempotente:",
    "-- volver a correrlo no cambia nada). No toca nombres, precios, stock, variantes ni fotos.",
    "BEGIN;",
    ...changes.map(
      (change) =>
        `-- ${change.name.replace(/\n/g, " ")}\nUPDATE products SET shape = ${sqlText(change.to)} WHERE id = '${change.id}' AND shape IS NOT DISTINCT FROM ${sqlText(change.from)} RETURNING id, shape;`,
    ),
    "COMMIT;",
    "",
  ].join("\n");
}

export function revertSql(changes: PlannedChange[], runId: string): string {
  return [
    `-- Reversión de la corrida ${runId}: vuelve cada forma a su valor anterior, solo si`,
    "-- sigue teniendo el valor que le puso la corrida (no pisa cambios posteriores).",
    "BEGIN;",
    ...changes.map(
      (change) =>
        `UPDATE products SET shape = ${sqlText(change.from)} WHERE id = '${change.id}' AND shape = ${sqlText(change.to)} RETURNING id, shape;`,
    ),
    "COMMIT;",
    "",
  ].join("\n");
}

// ─── Sources ────────────────────────────────────────────────────────────

/** PRODUCT lines of the read-only audit (auditoria-catalogo-*.txt). */
export function framesFromAudit(text: string): CatalogFrame[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("PRODUCT|"))
    .map((line) => line.split("|"))
    .filter((cells) => cells[2] === "FRAME")
    .map((cells) => ({
      id: cells[1]!,
      deleted: cells[3] === "eliminado",
      shape: cells[4] === "<null>" ? null : cells[4]!,
      brand: cells[5]!,
      category: cells[6]!,
      name: cells[7]!,
    }));
}

async function framesFromDatabase(): Promise<CatalogFrame[]> {
  const { prisma } = await import("../src/lib/prisma.js");
  const rows = await prisma.product.findMany({
    where: { kind: "FRAME" },
    select: {
      id: true,
      name: true,
      shape: true,
      deletedAt: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  await prisma.$disconnect();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shape: row.shape,
    deleted: row.deletedAt !== null,
    brand: row.brand.name,
    category: row.category.name,
  }));
}

export function buildPreview(frames: CatalogFrame[], approveHigh: boolean) {
  const rows = frames
    .map(classify)
    .filter((row): row is PreviewRow => row !== null)
    .map((row) =>
      approveHigh && row.confidence === "alta" ? { ...row, status: "aprobado" as Decision } : row,
    )
    .sort((a, b) =>
      a.confidence === b.confidence
        ? Number(a.deleted) - Number(b.deleted) || a.name.localeCompare(b.name)
        : a.confidence === "alta"
          ? -1
          : 1,
    );
  const active = frames.filter((frame) => !frame.deleted);
  const summary = {
    "armazones activos": active.length,
    "activos con forma oficial": active.filter(
      (frame) => frame.shape && isOfficialShape(frame.shape),
    ).length,
    "propuestas de alta confianza": rows.filter((row) => row.confidence === "alta").length,
    "para revisión manual": rows.filter((row) => row.confidence === "revisión").length,
  };
  return { rows, summary };
}

// ─── CLI ────────────────────────────────────────────────────────────────

function argument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args: string[]) {
  const [command] = args;
  const out = argument(args, "--salida");
  if (!out) throw new Error("Falta --salida <carpeta>.");
  mkdirSync(out, { recursive: true });
  if (command === "preview") {
    const auditPath = argument(args, "--auditoria");
    const frames = auditPath
      ? framesFromAudit(readFileSync(auditPath, "utf8"))
      : args.includes("--base")
        ? await framesFromDatabase()
        : (() => {
            throw new Error("Indicar --auditoria <archivo> o --base (usa DATABASE_URL).");
          })();
    const { rows, summary } = buildPreview(frames, args.includes("--aprobar-alta-confianza"));
    const source = auditPath ? path.basename(auditPath) : "base indicada en DATABASE_URL";
    writeFileSync(path.join(out, "vista-previa.html"), toHtml(rows, summary, source));
    writeFileSync(path.join(out, "decisiones.csv"), toCsv(rows));
    console.log(JSON.stringify(summary));
    console.log(`Vista previa: ${path.join(out, "vista-previa.html")}`);
    console.log(`Decisiones:   ${path.join(out, "decisiones.csv")}`);
    return;
  }
  if (command === "plan") {
    const decisionsPath = argument(args, "--decisiones");
    if (!decisionsPath) throw new Error("Falta --decisiones <decisiones.csv>.");
    const { changes, skipped } = planChanges(parseCsv(readFileSync(decisionsPath, "utf8")));
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(path.join(out, "aplicar.sql"), applySql(changes, runId));
    writeFileSync(path.join(out, "revertir.sql"), revertSql(changes, runId));
    writeFileSync(
      path.join(out, "registro.json"),
      JSON.stringify(
        { runId, origen: path.basename(decisionsPath), cambios: changes, omitidos: skipped },
        null,
        2,
      ),
    );
    console.log(`${changes.length} cambios aprobados; ${skipped.length} filas omitidas.`);
    console.log(`SQL a revisar: ${path.join(out, "aplicar.sql")} (reversión: revertir.sql)`);
    return;
  }
  throw new Error("Comando: preview | plan");
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("catalog-shapes.ts")) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
