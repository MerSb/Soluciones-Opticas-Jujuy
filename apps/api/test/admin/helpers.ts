import type { Express } from "express";
import request from "supertest";
import { prisma } from "../../src/lib/prisma.js";

// Registers a normal customer, then promotes it to ADMIN directly via
// Prisma — exactly what scripts/promote-to-admin.mjs does in real life,
// just inlined so tests don't shell out. Login is called a second time
// after the promotion because `authenticate` is stateless (it trusts
// the JWT payload, never re-reads the DB — see middleware/authenticate.
// ts): the access token issued at registration still says CUSTOMER, so
// a fresh login is what actually mints a token carrying role: "ADMIN".
export async function createAdminAgent(
  app: Express,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ firstName: "Admin", lastName: "Test", email, password: "password123" });
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}
