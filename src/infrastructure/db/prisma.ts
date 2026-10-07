import { PrismaClient } from "@prisma/client";

/**
 * Single instance reused across hot reloads in development — Next.js dev
 * mode re-evaluates modules on every change, which would otherwise open a
 * new connection pool per reload and exhaust Postgres' connection limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
