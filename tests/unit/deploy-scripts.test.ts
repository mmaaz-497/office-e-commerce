import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T052 — spec US7, contracts/deploy.md. Text assertions on the deploy,
 * web server and backup files: nothing here runs them. Comments are stripped
 * first, so a step that is only mentioned in a comment does not count.
 */
function read(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8");
}

/** The file with `#` comment lines removed (shell and nginx share the syntax). */
function code(file: string): string {
  return read(file)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Index of the first occurrence; fails the test when the text is missing. */
function at(source: string, text: string): number {
  const index = source.indexOf(text);
  expect(index, `expected to find: ${text}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("deploy/deploy.sh", () => {
  const deploy = code("deploy/deploy.sh");

  it("sources .env with export on", () => {
    expect(deploy).toMatch(/set -a\s*\n\s*source \.env\s*\n\s*set \+a/);
  });

  it("exits when UPLOAD_DIR is empty or not absolute, before npm ci", () => {
    const guard = at(deploy, 'case "${UPLOAD_DIR:-}" in');
    const block = deploy.slice(guard, deploy.indexOf("esac", guard));
    expect(block).toContain("/*) ;;");
    expect(block).toMatch(/\*\)[^\n]*exit 1;;/);
    expect(at(deploy, ".env")).toBeLessThan(guard);
    expect(guard).toBeLessThan(at(deploy, "npm ci"));
  });

  it('runs mkdir -p "$UPLOAD_DIR" before npm run build', () => {
    expect(at(deploy, 'mkdir -p "$UPLOAD_DIR"')).toBeLessThan(at(deploy, "npm run build"));
    expect(deploy).toContain('chmod 750 "$UPLOAD_DIR"');
  });

  it("migrates, then imports the catalogue, then reloads PM2", () => {
    const migrate = at(deploy, "prisma migrate deploy");
    const importCatalogue = at(deploy, "catalogue:import");
    const reload = at(deploy, "pm2 startOrReload");
    expect(migrate).toBeLessThan(importCatalogue);
    expect(importCatalogue).toBeLessThan(reload);
  });
});

describe("deploy/nginx.conf", () => {
  const nginx = code("deploy/nginx.conf");

  it("allows 3m on the upload route only", () => {
    expect(nginx.match(/client_max_body_size 3m;/g)).toHaveLength(1);
    const start = at(nginx, "location = /admin/api/uploads {");
    const block = nginx.slice(start, nginx.indexOf("}", start));
    expect(block).toContain("client_max_body_size 3m;");
    expect(block).toContain("proxy_pass http://127.0.0.1:3000;");
  });

  it("keeps 1m at server level", () => {
    const server443 = nginx.slice(at(nginx, "listen 443 ssl;"));
    const firstLocation = server443.indexOf("location ");
    expect(server443.slice(0, firstLocation)).toContain("client_max_body_size 1m;");
  });
});

describe("deploy/backup.sh", () => {
  it("copies UPLOAD_DIR off the server", () => {
    expect(code("deploy/backup.sh")).toContain('rclone copy "$UPLOAD_DIR"');
  });
});

describe("docs/restore-drill.md", () => {
  it("restores the uploads and checks one is served", () => {
    const drill = read("docs/restore-drill.md");
    expect(drill).toContain("UPLOAD_DIR");
    expect(drill).toContain("/uploads");
  });
});
