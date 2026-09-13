import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminLensTreatmentsService from "../services/admin-lens-treatments.service.js";
import type {
  CreateLensTreatmentBody,
  UpdateLensTreatmentBody,
} from "../schemas/admin-lens.schema.js";

export const listLensTreatments = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminLensTreatmentsService.listAdminLensTreatments());
});

export const getLensTreatment = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTreatmentsService.getAdminLensTreatment(id));
});

export const createLensTreatment = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateLensTreatmentBody;
  res.status(201).json(await adminLensTreatmentsService.createLensTreatment(body));
});

export const updateLensTreatment = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateLensTreatmentBody;
  res.json(await adminLensTreatmentsService.updateLensTreatment(id, body));
});

export const deleteLensTreatment = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTreatmentsService.softDeleteLensTreatment(id));
});

export const restoreLensTreatment = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminLensTreatmentsService.restoreLensTreatment(id));
});
