import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { productsRouter } from "./products.routes.js";
import { brandsRouter } from "./brands.routes.js";
import { categoriesRouter } from "./categories.routes.js";
import { branchesRouter } from "./branches.routes.js";
import { authRouter } from "./auth.routes.js";
import { profileRouter } from "./profile.routes.js";
import { favoritesRouter } from "./favorites.routes.js";
import { opticalProfileRouter } from "./optical-profile.routes.js";
import { recommendationsRouter } from "./recommendations.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/brands", brandsRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/branches", branchesRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/favorites", favoritesRouter);
apiRouter.use("/optical-profile", opticalProfileRouter);
apiRouter.use("/recommendations", recommendationsRouter);
