import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as favoritesService from "../services/favorites.service.js";

export const listFavorites = asyncHandler(async (req: Request, res: Response) => {
  const favorites = await favoritesService.listFavorites(req.auth!.userId);
  res.json(favorites);
});

export const addFavorite = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = res.locals.params as { slug: string };
  await favoritesService.addFavorite(req.auth!.userId, slug);
  res.status(204).send();
});

export const removeFavorite = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = res.locals.params as { slug: string };
  await favoritesService.removeFavorite(req.auth!.userId, slug);
  res.status(204).send();
});
