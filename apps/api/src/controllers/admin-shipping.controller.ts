import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminShippingService from "../services/admin-shipping.service.js";
import type {
  AdminShippingSimulationBody,
  CreateShippingPackageProfileBody,
  UpdateShippingPackageProfileBody,
} from "../schemas/shipping.schema.js";

export const listPackageProfiles = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminShippingService.listPackageProfiles());
});

export const createPackageProfile = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateShippingPackageProfileBody;
  res.status(201).json(await adminShippingService.createPackageProfile(body));
});

export const updatePackageProfile = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateShippingPackageProfileBody;
  res.json(await adminShippingService.updatePackageProfile(id, body));
});

export const deletePackageProfile = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminShippingService.softDeletePackageProfile(id));
});

export const restorePackageProfile = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminShippingService.restorePackageProfile(id));
});

export const setDefaultPackageProfile = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminShippingService.setDefaultPackageProfile(id));
});

export const simulateShippingQuote = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as AdminShippingSimulationBody;
  res.json(await adminShippingService.simulateShippingQuote(body));
});
