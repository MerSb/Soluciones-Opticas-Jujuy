import { Router } from "express";

export const healthRouter = Router();

// Liveness only — "is the process running". No database round-trip.
// A DB-aware readiness check is a real thing to want eventually, but
// nothing consumes one yet (no orchestrator/health-probe is configured
// at this stage); add it when the deployment step actually wires one up.
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});
