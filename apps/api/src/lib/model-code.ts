// Suggested model code of a SKU (docs/MODELOS_POR_SKU.md) — a reading aid,
// never stored and never used to group anything automatically.
//
// The shop's SKUs are typed by hand. Most frames follow "<model><color>",
// with the color as c/col + 1–3 digits and any spacing: "TJ8604 c3",
// "Tr8556C3", "95761-C1", "H3152 col 602", "H3533-COL616", "H3533C616".
// Their model code is the part before that suffix, compared without case,
// spaces or punctuation: "TJ8604", "TR8556", "95761", "H3152", "H3533".
//
// Deliberately narrow: the part before the suffix must contain a digit and
// keep 3+ characters, so "TC2" or "AC1" give no code. A SKU outside the
// pattern ("ParisRosayoro", "murphy aviador", "FE6906") gets none — about a
// quarter of the catalog — rather than a guess. Two products sharing a code
// may still be different frames (same supplier number, another shape or
// price): the admin shows them as unconfirmed suggestions only.

const COLOR_SUFFIX = /^(.*?\d.*?)[\s\-_/.]*(?:col|c)\s*\.?\s*\d{1,3}$/i;

/** Upper case, accents dropped, only letters and digits: "h3533-col 616" → "H3533COL616". */
export function normalizeSkuText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** The model code suggested by a SKU's shape, or null when it has none. */
export function suggestedModelCode(sku: string): string | null {
  const match = COLOR_SUFFIX.exec(sku.trim());
  if (!match) return null;
  const code = normalizeSkuText(match[1]!);
  return code.length >= 3 && /\d/.test(code) ? code : null;
}
