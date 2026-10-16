// Drafts are visible in `npm run dev` only, to review them — never in a
// build (DEV is a build-time `false` there) and never in tests (tests check
// what visitors of the published site get).
export const SHOW_LEGAL_DRAFTS = import.meta.env.DEV && import.meta.env.MODE !== "test";
