import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminLensTypesService from "../services/admin-lens-types.service.js";
import type {
  CreateLensOptionBody,
  CreateLensTypeBody,
  UpdateLensOptionBody,
  UpdateLensTypeBody,
} from "../schemas/admin-lens.schema.js";

export const listLensTypes = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminLensTypesService.listAdminLensTypes());
});

export const getLensType = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTypesService.getAdminLensType(id));
});

export const createLensType = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateLensTypeBody;
  res.status(201).json(await adminLensTypesService.createLensType(body));
});

export const updateLensType = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateLensTypeBody;
  res.json(await adminLensTypesService.updateLensType(id, body));
});

export const deleteLensType = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTypesService.softDeleteLensType(id));
});

export const restoreLensType = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTypesService.restoreLensType(id));
});

export const createLensOption = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as CreateLensOptionBody;
  res.status(201).json(await adminLensTypesService.createLensOption(id, body));
});

export const updateLensOption = asyncHandler(async (_req: Request, res: Response) => {
  const { id, optionId } = res.locals.params as { id: string; optionId: string };
  const body = res.locals.body as UpdateLensOptionBody;
  res.json(await adminLensTypesService.updateLensOption(id, optionId, body));
});

export const deleteLensOption = asyncHandler(async (_req: Request, res: Response) => {
  const { id, optionId } = res.locals.params as { id: string; optionId: string };
  res.json(await adminLensTypesService.softDeleteLensOption(id, optionId));
});

export const restoreLensOption = asyncHandler(async (_req: Request, res: Response) => {
  const { id, optionId } = res.locals.params as { id: string; optionId: string };
  res.json(await adminLensTypesService.restoreLensOption(id, optionId));
});
