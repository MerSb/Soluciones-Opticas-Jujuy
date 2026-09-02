import { z } from "zod";

// Only customer-owned display fields — never role, email (see §20 of the
// auth brief: email editing is deferred, not casually implemented,
// since it would need its own verification semantics), auth_provider,
// or any internal field. All optional: a PATCH may touch just one field.
// Zod's default `z.object()` behavior strips unrecognized keys rather
// than erroring or passing them through — a client sending {role:
// "ADMIN"} alongside real fields has that key silently dropped before
// it ever reaches the service layer, not merely ignored by convention.
export const updateProfileBodySchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
