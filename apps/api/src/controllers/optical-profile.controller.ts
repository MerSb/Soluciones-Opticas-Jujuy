import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as opticalProfileService from "../services/optical-profile.service.js";
import type { UpdateOpticalProfileBody } from "../schemas/optical-profile.schema.js";

export const getOpticalProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await opticalProfileService.getOpticalProfile(req.auth!.userId);
  res.json(profile);
});

export const updateOpticalProfile = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as UpdateOpticalProfileBody;
  const profile = await opticalProfileService.upsertOpticalProfile(req.auth!.userId, body);
  res.json(profile);
});
