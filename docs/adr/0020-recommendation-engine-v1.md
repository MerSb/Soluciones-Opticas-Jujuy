# ADR-0020: Recommendation Engine V1 — rules-based, deterministic, explainable

**Status:** Approved.

## Context

`CustomerOpticalProfile` (ADR-0019) now holds real customer measurements and preferences. This
phase builds the first thing that actually reads it: a system comparing a customer's profile
against the catalog and producing ranked, explained recommendations. The brief is explicit and
non-negotiable: rules-based, deterministic, testable, configurable — no ML, no embeddings, no
behavioral tracking, no collaborative filtering.

## Why rules-based, not ML

Consistent with ADR-0007 (recommendation rules as versioned code, not a DB table) and the
project's broader pattern of not reaching for infrastructure a stage doesn't need yet: an ML
approach needs training data (purchase/interaction history) this project has none of, needs to be
explainable to a customer in plain Spanish (a trained model's weights aren't), and needs to be
testable with exact expected outputs (a deterministic rules engine is naturally unit-testable;
a model's output is not, in the same way). A rules engine can be fully specified, fully tested,
and fully explained in this one document — a genuine requirement here, not a preference.

## Normalization architecture

The highest-priority piece, per the brief's own emphasis. `Product.shape`/`ProductVariant.
material`/`.color` are free text (confirmed by inspection, ADR-0019 already documented this); the
customer profile uses canonical enums. `apps/api/src/services/recommendation/normalize.ts` holds
three pure functions — `normalizeShape`, `normalizeMaterial`, `normalizeColor` — each mapping a
raw catalog string to a canonical value or `null` (never throws, never guesses past its explicit
synonym table). No `normalizeStyle()` exists: `Product` has no style metadata at all today, so
there is nothing to normalize _against_ — `preferredStyles` is accepted by the scoring core's
input type but never influences a score (verified by a dedicated test).

**Pipeline** (`normalizeText`): trim → lowercase → Unicode NFD decomposition + strip combining
marks (accent removal) → hyphens/underscores → spaces → collapse whitespace. `"Cat-Eye"`,
`"cat eye"`, `"CAT_EYE"` all reduce to the same key.

**Shape/material**: whole-string lookup against an explicit synonym table (not fuzzy matching —
the brief is explicit: "do not overbuild fuzzy NLP"). Each entry is a real, tested mapping;
nothing is guessed.

**Color**: token-based, not whole-string or substring. A catalog color is often a base color plus
a modifier ("Negro mate", "Carey oscuro") — token matching (split the normalized string on
spaces, check each token against each family's keyword list) resolves the base family correctly
without false-positive substring matches. **Compound colors** ("Negro y dorado", "Dorado rosa")
resolve to `MULTICOLOR` when keywords from two or more distinct families are found — arbitrarily
picking the first family found would misrepresent the product and silently drop a real signal.

## Scoring formula

`apps/api/src/services/recommendation/scoring.ts` — pure functions, zero Express/Prisma/React
dependency, fully unit-testable in isolation (48 tests).

For each candidate product, for each of its variants: sum `earned` and `applicable` weight across
six signals (shape, material, color, and four dimensions). A signal is **applicable only when
both sides have usable data** — an empty preference list, a `null` measurement on either side, or
an unrecognized catalog value all exclude that signal from both numerator and denominator, never
count as a mismatch (§7 of the brief, its own "critical rule", directly verified by tests).

```
score = round(earnedWeight / applicableWeight × 100)   — for the chosen best variant
```

Never `earnedWeight / totalSystemWeight` — that would unfairly punish an incomplete profile
simply for being incomplete. A product where **nothing** was applicable (zero comparable data on
either side) is excluded from the ranked results entirely, rather than shown at a misleading
score of 0 — there is nothing to explain about a product with zero applicable signals.

## V1 weights (`recommendation/config.ts`)

| Category           | Weight | Why                                                                        |
| ------------------ | ------ | -------------------------------------------------------------------------- |
| Shape              | 25     | A clear, binary stated preference                                          |
| Material           | 15     | Per-variant preference, similar structure to color                         |
| Color              | 15     | Per-variant preference, similar structure to material                      |
| Dimensions (total) | 45     | Most objective signal — a measured fact, populated on every seeded product |

Dimension sub-weights: lens width 20, bridge width 10, temple length 10, lens height 5 (sum 45).
Lens width is the single most fit-defining dimension in real eyewear practice; lens height is the
field this project added beyond the optical-profile brief's own three (ADR-0012/ADR-0019
precedent) and the least commonly known — smallest weight. Illustrative starting point from the
brief (Shape 25/Material 15/Color 10/Dimensions 50) was adjusted: color raised to match material
(both are structurally identical per-variant preference signals — no basis to weight one over the
other at this catalog's size) and dimensions correspondingly reduced to 45.

## Dimension tolerance (heuristic, not medical)

Gradual, not binary exact/not-exact — explicitly documented as **similarity heuristics**, never
medical or manufacturing tolerances:

| Difference | Fraction of weight earned |
| ---------- | ------------------------- |
| ≤ 2mm      | 100%                      |
| ≤ 5mm      | 60%                       |
| ≤ 10mm     | 25%                       |
| > 10mm     | 0%                        |

The same bands apply uniformly to all four measurements — a deliberate V1 simplification (a
lens-width difference and a bridge-width difference of equal magnitude are treated as equally
significant). Revisit with per-dimension-scaled bands only if real usage shows this is wrong, not
speculatively now.

## Missing-data behavior (verified, not just documented)

Directly unit-tested: a candidate missing a dimension, a customer missing a dimension, an empty
preference list, and an unrecognized catalog value all produce identical results to that signal
never having existed — confirmed never to lower a score, confirmed never to exclude a product
just because of what it's missing.

## Coverage / confidence semantics

**Three** distinct numbers, deliberately not conflated (a pre-approval audit found the third one
was computed but never actually exposed — see "Post-audit hardening" below):

- **`score`** (per recommendation): compatibility _among what was comparable_ — can be a
  mathematically real 100 from a single strong signal on an otherwise-sparse profile. A shape-only
  preference, fully matched, earns every applicable point there is — `score` alone cannot and does
  not try to communicate how little that "every point" actually was.
- **`matchEvidence`** / **`evidenceLevel`** (per recommendation): `applicableWeight for this
specific product's best variant ÷ TOTAL_POSSIBLE_WEIGHT × 100`, bucketed with the same LOW/
  MEDIUM/HIGH thresholds as `confidenceLevel` below. This is what actually distinguishes a
  one-signal 100 from a six-signal 100 — `score` cannot, by construction, since both are 100.
  Verified directly: `GET /api/recommendations` for a profile with only `preferredShapes` set
  returns `score: 100, matchEvidence: 25, evidenceLevel: "LOW"` for the matching seeded product
  (`apps/api/test/recommendations.test.ts`, "a real single-signal-only profile..."). Also distinct
  from `profileCoverage` below in general: a candidate can be missing data the customer _did_
  specify (e.g. a product with no recorded lens width, even though the customer gave one),
  lowering _that product's_ `matchEvidence` below the customer's own `profileCoverage` — verified
  by a dedicated unit test.
- **`profileCoverage`** (response-level, once): how much of the _customer's own_ stated data is
  usable, independent of any specific product — `applicableWeight / TOTAL_POSSIBLE_WEIGHT × 100`,
  computed once from the profile alone. Drives the "complete your profile" messaging (§32 of the
  brief), which is about the customer's input, not any one product's data gaps.

`confidenceLevel` and `evidenceLevel` (`LOW`/`MEDIUM`/`HIGH`) both read the same
`CONFIDENCE_LEVELS` thresholds from `config.ts` via one shared function
(`coverageToConfidenceLevel`) — one centralized bucketing rule applied to two different coverage
numbers, not two independent implementations that could drift apart. Never called "AI confidence"
anywhere in code, docs, or UI copy.

**Frontend:** `RecommendationCard` shows a small caveat line — "Basado en poca información de tu
perfil." (LOW) / "Basado en información parcial de tu perfil." (MEDIUM) — directly under the
score, omitted entirely when `evidenceLevel` is HIGH (the common, well-evidenced case shouldn't
carry visual noise). This is the customer-facing half of the fix: the number existing in the API
response isn't sufficient on its own if nothing on the card actually uses it to qualify a high
score.

## Tiers

`score` bucketed into `HIGH`/`MEDIUM`/`LOW` at `SCORE_TIERS.HIGH` (70) / `SCORE_TIERS.MEDIUM` (40)
— `"Alta compatibilidad"` / `"Buena compatibilidad"` / `"Compatibilidad parcial"`. Deliberately
not `"Perfecto para vos"` or `"100% ideal"` anywhere — the score is a comparison against stated
information, not a guarantee. `scoreToTier`/`coverageToConfidenceLevel` read `SCORE_TIERS`/
`CONFIDENCE_LEVELS` directly from `config.ts` — not a second, hardcoded copy of the same numbers
(a pre-approval audit caught exactly that duplication; see "Post-audit hardening"). Boundary
tests cover the value immediately below, at, and immediately above each threshold.

## Variant selection and stock

Shape and the four dimensions live on `Product`, shared by every variant; material and color live
on `ProductVariant`. A product's score is its **best variant's** score, not an average across
variants — the variant earning the most **raw points** wins (not the highest earned/applicable
_ratio_, which would let a variant with very little applicable data but a lucky full match on
that little beat a variant that matched more overall).

**Stock policy** (hardened post-audit — see below): availability is a **hard partition**, applied
_before_ score, not a tiebreak applied only when two variants score identically. If a product has
at least one in-stock variant, only in-stock variants are ever eligible to become `bestVariant` —
full stop, even when an out-of-stock sibling scored strictly higher. A slightly-weaker but
actually-purchasable variant is what "best" has to mean for a customer who can act on the
recommendation; a better-matching variant they cannot buy is not a better recommendation, it's a
dead end. Only when a product has **no** in-stock variant at all does the pool fall back to
scoring among every variant — the product still gets recommended, still ranked purely on its
earned score like any other; no artificial ranking penalty is applied for being fully out of
stock, since inventing one would itself be a new, undocumented policy the brief's own §24 never
asked for (it only requires that an unavailable variant never be chosen _when an available one
exists_ — it says nothing about penalizing a product that has no available variant at all).
Remaining ties (equal score, same availability bucket) are broken deterministically by variant id
— never `Math.random()`, never insertion order left to chance.

## Style-preference limitation

`preferredStyles` is accepted and stored (ADR-0019) but contributes **zero** applicable weight in
V1 — `Product` has no style metadata to compare it against, and inferring style from brand, price,
or product name was explicitly ruled out by the brief as unreliable invention. Directly tested:
adding style preferences to an otherwise-identical profile never changes the score.

## Tie-breaking and determinism

Ranking: `score` DESC → `coverage` DESC (more evidence behind an equal score is a meaningfully
better recommendation) → product id ASC (a stable tiebreak always available, unlike name, which
could collide or reorder on a catalog edit). No randomness anywhere in the scoring path — verified
by a test asserting identical output across repeated calls with identical input, and an API test
asserting identical responses across repeated requests.

## API

`GET /api/recommendations?limit=6` (default 6, max 20), `authenticate` only — no `:userId`, always
`req.auth.userId`. No customer optical profile → `200` with `{ recommendations: [], profileCoverage:
0, confidenceLevel: "LOW", profileIncomplete: true }`, never a 500, never a misleading full result
set (§38 of the brief). No dedicated rate limiter: computation is a single bounded query plus
in-memory scoring, no costlier than any other authenticated `GET` (§78) — measured at ~5ms/query
against the current catalog size (see "Performance").

## Performance

Measured directly against the local dev database: candidate loading is **5 queries total**
(products, brands batch, categories batch, variants batch, images batch) regardless of product
count — Prisma batches nested `select` relations rather than issuing one query per product, so
this does not degrade to N+1 as the catalog grows. Each query completed in ~1ms against the
current 4-product/7-variant seed. Scoring itself is pure in-memory computation with no I/O.
**Scalability limit, documented honestly:** this loads every non-deleted product into memory per
request — reasonable at this catalog's current and near-term size (dozens to low hundreds of
products), not designed for a catalog of tens of thousands. Revisit with a bounded/paginated
candidate query (e.g., pre-filtering by category or a cheap DB-side shape/material match before
scoring) if the catalog grows well past that, not speculatively now — no Redis, no vector
database, no precomputed recommendation table introduced in V1.

## Shared-package safety

Learned directly from the optical-profile phase's own mistake: `@soluciones-opticas/shared` stays
type-only (ADR-0015). `packages/shared/src/recommendations.ts` exports only DTO interfaces — no
weight constants, no synonym maps, no tolerance bands. All runtime configuration/normalization
logic lives in `apps/api` only. Verified directly against the compiled `dist/` output: no runtime
import from the shared package anywhere in the recommendation code.

## Alternatives considered

- **Persisting computed scores in a new table** — rejected per the brief's own explicit
  instruction: recommendations are derived data, computed on request, no schema change added for
  this phase. Revisit only if a demonstrated performance need arises, which the measurements above
  don't show yet.
- **A `recommendation_rules` DB table for configurable weights** — already rejected in ADR-0007;
  nothing here reopens that. V1 config is code (`config.ts`), reviewable and testable like any
  other source file; externalizing it to a DB-editable form is future scope if the business
  genuinely needs to retune without a deploy.
- **Averaging all variants' scores instead of best-variant selection** — rejected: a product with
  one perfect-match variant and several irrelevant ones should surface as a strong match, not be
  diluted by variants the customer would never actually consider.

## Future evolution path

The scoring core takes a `CustomerProfileInput` and a `CandidateProductInput` — adding a future
signal (self-selected face shape, brand preference, budget, a structured signal from a future
facial-analysis system) means adding one more `scorePreferenceSignal`/`scoreDimensionSignal` call
and one more weight in `config.ts`, not rewriting the core. Facial analysis, if built later,
should produce a **structured signal fed into this engine** — it must never replace it, and this
engine must never assume biometric input exists. Virtual Try-On (visualization) and this engine
(ranking) stay decoupled: a product can be recommended without VTO and virtually tried without
being highly recommended.

## Post-audit hardening

A small audit before this ADR's own approval — commit `1ef09c4` was the implementation being
reviewed — found three real gaps between what was documented/intended and what the code actually
did, all fixed in the commit that follows it:

1. **Per-recommendation evidence was computed but never exposed.** `scoreProduct` already
   returned a `coverage` number, but `RecommendationDto` never carried it — only the
   response-level `profileCoverage` reached the client, which does not protect a specific card
   from showing a mathematically-real 100 score with no accompanying signal that it was built
   from very little. Fixed by adding `matchEvidence`/`evidenceLevel` to `RecommendationDto` and a
   caveat line on low/medium-evidence cards. See "Coverage / confidence semantics" above.
2. **The stock policy only protected against exact score ties**, not the more common real case of
   a strictly-better-scoring out-of-stock variant beating a slightly-weaker in-stock one. Fixed by
   making availability a hard partition evaluated before score, per "Variant selection and stock"
   above.
3. **Tier thresholds were duplicated, not centralized** — `config.ts` defined `SCORE_TIERS`/
   `CONFIDENCE_LEVELS`, but `scoreToTier`/`coverageToConfidenceLevel` had their own hardcoded
   `70`/`40`/`35` literals that happened to match, not actually read the config. A threshold
   change would have silently done nothing. Fixed by reading the config constants directly, plus
   added boundary tests (immediately below/at/above each threshold) that didn't exist before.

All three were caught by re-reading the actual implementation against the original brief's
requirements, not assumed correct because the final report described the intended behavior — the
report described intent accurately; the code hadn't fully caught up to it in these three spots.
11 new backend tests and 1 new frontend test cover the fixes; no existing test needed to change
its expected behavior (the fixes are strictly stricter/more complete, not a redesign).

## Known limitations

- Catalog free text vs. canonical preference enums is normalized via an explicit synonym table,
  not a comprehensive NLP system — an unmapped catalog value is silently excluded from scoring
  (never crashes, never guessed), which is the deliberately conservative choice, not a gap to
  "fix" by guessing harder.
- No behavioral signal of any kind (clicks, views, purchase history, favorite frequency) — V1 uses
  only explicitly stored profile data, per the brief's explicit prohibition.
- No brand or price bias — verified by the weight table containing neither category.
- Candidate loading is O(catalog size) per request — documented scalability limit above.
