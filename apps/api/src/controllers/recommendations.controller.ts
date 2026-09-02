import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as recommendationService from "../services/recommendation.service.js";
import type { RecommendationsQuery } from "../schemas/recommendations.schema.js";

export const getRecommendations = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = res.locals.query as RecommendationsQuery;
  const response = await recommendationService.getRecommendations(req.auth!.userId, limit);
  res.json(response);
});
