import { Router } from "express";
import { listCategories } from "../controllers/categories.controller.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", listCategories);
