import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { adminBrandsRouter } from "./brands.routes.js";
import { adminCategoriesRouter } from "./categories.routes.js";
import { adminProductsRouter } from "./products.routes.js";

export const adminRouter = Router();

// Applied once, here, rather than repeated on every individual route —
// every single route under /api/admin requires an authenticated ADMIN,
// with no exceptions, so there is no route that would ever need a
// different combination. authenticate (who are you) then authorize
// (are you allowed), same two-step chain as every other protected route
// in this API (see middleware/authenticate.ts / authorize.ts).
adminRouter.use(authenticate, authorize("ADMIN"));

adminRouter.use("/brands", adminBrandsRouter);
adminRouter.use("/categories", adminCategoriesRouter);
adminRouter.use("/products", adminProductsRouter);
