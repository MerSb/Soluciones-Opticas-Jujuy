import { z } from "zod";

// Backend validation is authoritative (§9 of the auth brief) — the
// frontend mirrors this but never substitutes for it.
export const registerBodySchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá tu nombre.").max(100),
  lastName: z.string().trim().min(1, "Ingresá tu apellido.").max(100),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido.").max(255),
  phone: z.string().trim().min(6).max(30).optional(),
  // No forced uppercase/symbol/number classes (§9) — meaningful length
  // only. 72: bcrypt's own effective input cap, so this is also where
  // hashPassword would silently ignore anything past it if not enforced
  // — enforced explicitly here instead, with a clear message, rather
  // than truncating silently.
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña es demasiado larga."),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});
export type LoginBody = z.infer<typeof loginBodySchema>;
