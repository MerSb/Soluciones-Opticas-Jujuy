import { Router } from "express";
import { addFavorite, listFavorites, removeFavorite } from "../controllers/favorites.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateParams } from "../middleware/validate.js";
import { slugParamSchema } from "../schemas/common.schema.js";

export const favoritesRouter = Router();

favoritesRouter.get("/", authenticate, listFavorites);
favoritesRouter.post("/:slug", authenticate, validateParams(slugParamSchema), addFavorite);
favoritesRouter.delete("/:slug", authenticate, validateParams(slugParamSchema), removeFavorite);
