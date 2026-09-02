// Authentication/account contracts — apps/api produces these, apps/web
// consumes them. Type-only, same reasoning as catalog.ts (see ADR-0015).
// No AuthResponse DTO: the session lives entirely in an httpOnly cookie
// (see docs/adr/0018-authentication-session-strategy.md), never in a
// response body, so register/login/me all just return SafeUserDto.

import type { ProductListItem } from "./catalog.js";

export type Role = "CUSTOMER" | "ADMIN";

// Never password_hash, auth_provider, auth_provider_id, or any other
// internal field — this is the one shape the client ever sees.
export interface SafeUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface FavoriteDto {
  id: string;
  createdAt: string;
  product: ProductListItem;
}
