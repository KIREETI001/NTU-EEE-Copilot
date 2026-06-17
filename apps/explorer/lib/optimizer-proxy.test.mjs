// Run: node --test  (from apps/explorer)
// Pure-logic tests for the proxy allowlist. No network, no Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEnginePath, ALLOWED_ENGINE_PATHS } from "./optimizer-proxy.ts";

test("allows every real engine endpoint", () => {
  for (const p of ALLOWED_ENGINE_PATHS) {
    assert.equal(resolveEnginePath(p.split("/")), `/${p}`);
  }
});

test("forwards the WS3 specialization/plan endpoint", () => {
  assert.equal(resolveEnginePath(["specialization", "plan"]), "/specialization/plan");
});

test("rejects unknown paths (no SSRF gadget)", () => {
  assert.equal(resolveEnginePath(["admin"]), null);
  assert.equal(resolveEnginePath(["internal", "metrics"]), null);
});

test("rejects path traversal and slipped separators", () => {
  assert.equal(resolveEnginePath([".."]), null);
  assert.equal(resolveEnginePath(["fgo", ".."]), null);
  assert.equal(resolveEnginePath(["cgpa%2f.."]), null);
  assert.equal(resolveEnginePath(["fgo/suggest"]), null); // slash inside a segment
  assert.equal(resolveEnginePath(["CGPA"]), null); // uppercase not allowed
});

test("rejects empty input", () => {
  assert.equal(resolveEnginePath(undefined), null);
  assert.equal(resolveEnginePath([]), null);
});
