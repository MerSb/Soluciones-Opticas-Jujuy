import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as usersService from "../services/users.service.js";
import type { UpdateProfileBody } from "../schemas/profile.schema.js";

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getSafeUserById(req.auth!.userId);
  res.json(user);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as UpdateProfileBody;
  const user = await usersService.updateProfile(req.auth!.userId, body);
  res.json(user);
});
