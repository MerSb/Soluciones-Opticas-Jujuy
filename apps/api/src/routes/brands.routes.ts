import { Router } from "express";
import { listBrands } from "../controllers/brands.controller.js";

export const brandsRouter = Router();

brandsRouter.get("/", listBrands);
