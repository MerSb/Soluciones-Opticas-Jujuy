# ADR-0008: No facial-data persistence by default

**Status:** Approved (not built until Etapa 4)

## Context

Facial landmarks and camera-derived data are biometric. Storing them carries legal, privacy, and
security exposure well beyond a typical product-preference field, and the brief is explicit that
recommendations must never be presented as clinical/diagnostic.

## Decision

Facial-landmark processing (MediaPipe or equivalent) runs client-side via WASM; landmarks are
computed and consumed entirely in browser memory. Nothing biometric is uploaded to or stored by
the backend by default. No `facial_data` or `photos` table exists in the schema at any stage of
this engagement.

## Alternatives considered

Server-side processing with stored landmarks (enables server-side recommendation blending) —
rejected for now: the privacy/compliance cost isn't justified by a feature that hasn't been
validated as client-side-only yet. Revisit only as an explicit, separately-consented future
feature, never as a silent extension of the existing schema.

## Consequences

Any future "save my try-on look" feature is new scope with its own consent and retention design,
not a natural extension of what's built now.
