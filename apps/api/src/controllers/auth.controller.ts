import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import type { SessionDto } from "@soluciones-opticas/shared";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../lib/cookies.js";
import { verifyAccessToken } from "../lib/jwt.js";
import * as authService from "../services/auth.service.js";
import * as usersService from "../services/users.service.js";
import type { LoginBody, RegisterBody } from "../schemas/auth.schema.js";

export const register = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as RegisterBody;
  const session = await authService.register(body);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.status(201).json(session.user);
});

export const login = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as LoginBody;
  const session = await authService.login(body);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.json(session.user);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!token) {
    throw ApiError.unauthenticated("Tu sesión expiró. Iniciá sesión nuevamente.");
  }
  const session = await authService.rotateRefreshToken(token);
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.json(session.user);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (token) {
    await authService.revokeRefreshToken(token);
  }
  clearAuthCookies(res);
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getSafeUserById(req.auth!.userId);
  res.json(user);
});

// Anonymous visitors are the common case: answer 200 { user: null }
// instead of a 401, so loading a page doesn't log errors or spend the
// refresh rate limit. Same token checks as `authenticate`; never sets or
// rotates cookies. `canRefresh` only says whether the browser sent its
// own refresh cookie (scoped to /api/auth).
export const session = asyncHandler(async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      const user = await usersService.findSafeUserById(payload.sub);
      if (user) {
        res.json({ user, canRefresh: false } satisfies SessionDto);
        return;
      }
    } catch {
      // Expired or invalid access token: treated as no session below.
    }
  }
  res.json({
    user: null,
    canRefresh: Boolean(req.cookies?.[REFRESH_TOKEN_COOKIE]),
  } satisfies SessionDto);
});
