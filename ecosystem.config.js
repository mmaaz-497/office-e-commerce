/**
 * PM2 process file (research.md R-017). Runs the `next build --standalone`
 * output directly with `node server.js`, not `next start` — standalone mode
 * exists precisely so production doesn't need the full node_modules tree.
 * `deploy/deploy.sh` is what actually copies `public/`, `.next/static/` and
 * `.env` into `.next/standalone/` after every build (Next.js does not do
 * this itself); this file assumes that copy has already happened.
 *
 * `instances: 2` + `exec_mode: "cluster"` gives Node's own cluster module
 * two workers sharing one listening socket — this is *why* R-011 puts the
 * rate limiter in PostgreSQL rather than memory: an in-process counter would
 * silently be per-worker, not per-limit.
 *
 * HOSTNAME binds the standalone server itself to loopback, matching the
 * Constitution's "PostgreSQL never publicly reachable" posture extended to
 * the app tier too — only Nginx, listening on the public interface, proxies
 * inward to 127.0.0.1.
 */
module.exports = {
  apps: [
    {
      name: "tokoshopee",
      script: "server.js",
      cwd: "./.next/standalone",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
