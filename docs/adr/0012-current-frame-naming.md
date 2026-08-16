# ADR-0012: `current_frame_*` naming for the user's existing-frame measurements

**Status:** Approved (not built until Etapa 2)

## Context

The signed proposal's own language for these fields is _"medidas de montura actual"_ — the
user's current, owned frame, a measured physical fact. An earlier draft of this schema named
them `preferred_lens_width`, `preferred_bridge_width`, etc., which conflates a measurement with
an abstract taste preference (the kind that genuinely applies to `preferred_colors`,
`preferred_styles`, `preferred_materials`).

## Decision

`user_measurements` uses `current_frame_lens_width`, `current_frame_bridge_width`,
`current_frame_temple_length`, `current_frame_lens_height` for the user's existing-frame
measurements. `preferred_*` naming is reserved exclusively for genuine stated taste (colors,
styles, materials).

## Alternatives considered

Keep `preferred_*` for everything, including measurements — rejected: the recommendation engine
(Etapa 3) treats a measured fact and a stated preference very differently in its scoring logic;
naming that blurs the distinction in the schema makes that logic harder to reason about, not
just harder to read.

## Consequences

None outside naming — purely a clarity/correctness fix caught during architecture validation,
before any table existed.
