---
id: 0007
title: Fix dev database port clash
stage: general
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["dev-environment", "docker", "postgresql", "prisma", "debugging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - docker-compose.yml
 - .env.example
 - .env (local, gitignored)
tests:
 - npx prisma migrate status (schema up to date)
 - Prisma count query via .env (categories 1, products 12)
---

## Prompt

i face this error on start the application please fix this problem



## Error Type
Runtime PrismaClientInitializationError

## Error Message

Invalid `prisma.category.findMany()` invocation:


Authentication failed against database server, the provided database credentials for `tokoshopee` are not valid.

Please make sure to provide valid database credentials for the database server at the configured address.


    at eval (src\infrastructure\db\catalogue.ts:301:18)

## Code Frame
  299 | export const listStorefrontCategories = cache(
  300 |   async (locale: AppLocale): Promise<StorefrontCategory[]> => {
> 301 |     const rows = await prisma.category.findMany({
      |                  ^
  302 |       where: { products: { some: { status: { in: [...LISTED_STATUSES] } } } },
  303 |       orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  304 |       select: { slug: true, nameId: true, nameEn: true },

Next.js version: 15.5.25 (Webpack)

## Response snapshot

Root cause: not wrong credentials but a port clash. A native Docker daemon inside the
Ubuntu-22.04 WSL distro runs `urdu-video-studio-dev-postgres-1` (postgres:16, restart
unless-stopped) publishing 0.0.0.0:5432, which wslrelay forwards to Windows localhost. The
project's Docker Desktop container `i-e-commerce-db-1` therefore could not publish
127.0.0.1:5432 (Ports: []), and the app's DATABASE_URL reached the other project's
PostgreSQL, where the `tokoshopee` role/password does not exist.

The user chose to move Tokoshopee's dev database to host port 5433: docker-compose.yml now
publishes "127.0.0.1:5433:5432" (still loopback-only), and DATABASE_URL in .env and
.env.example points at 127.0.0.1:5433. Recreated the container with
`docker compose up -d --force-recreate db` (named volume kept, data intact). Verified
`prisma migrate status` reports the schema up to date and Prisma reads 1 category and 12
products. The already-running dev server on :3000 still returned 500 with the old URL loaded
and must be restarted to pick up the new .env.

## Outcome

- ✅ Impact: dev app can reach its own database again; both projects can run side by side.
- 🧪 Tests: prisma migrate status and a Prisma count query pass; homepage needs a dev-server restart to confirm.
- 📁 Files: docker-compose.yml, .env.example (committed); .env (local).
- 🔁 Next prompts: restart `npm run dev` and load http://localhost:3000.
- 🧠 Reflection: "authentication failed" with known-good credentials usually means the wrong server answered; check who owns the port before touching passwords.

## Evaluation notes (flywheel)

- Failure modes observed: misleading Prisma error message; docker CLI in WSL showed Docker Desktop's containers, hiding the native daemon's container until /var/lib/docker was inspected as root.
- Graders run and results (PASS/FAIL): prisma migrate status PASS; Prisma count query PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
