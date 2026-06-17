// =============================================================================
// BFF proxy — path allowlist (the security-critical pure logic, unit-tested).
//
// The /api/optimizer/[...path] route handler is the ONLY thing the browser can
// reach; it forwards server-to-server to the private engine. This module decides
// WHICH engine paths it is allowed to forward to. Keeping it pure + tested stops
// the proxy from becoming a generic SSRF gadget (see WS5 design §2.2).
// =============================================================================

// Mirrors the engine's real routes (services/engine/app/main.py). NOTE: includes
// `specialization/plan` (added by WS3, after the WS5 design doc was written).
export const ALLOWED_ENGINE_PATHS: ReadonlySet<string> = new Set([
  "cgpa",
  "fgo/quota",
  "fgo/simulate",
  "fgo/suggest",
  "specialization/check",
  "specialization/plan",
  "honours",
  "parse-audit",
  "health",
]);

// Each segment must be a plain lowercase token — blocks "." / ".." traversal,
// slashes, encoded bytes, query smuggling, etc. Returns the engine path
// (leading slash) if allowlisted, else null.
export function resolveEnginePath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null;
  for (const seg of segments) {
    if (!/^[a-z0-9-]+$/.test(seg)) return null;
  }
  const joined = segments.join("/");
  return ALLOWED_ENGINE_PATHS.has(joined) ? `/${joined}` : null;
}
