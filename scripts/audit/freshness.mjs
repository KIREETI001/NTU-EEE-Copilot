// =============================================================================
// freshness.mjs  —  lightweight "has this source changed?" signal
// =============================================================================
// For sources with no structured API (the handbook PDF, curriculum HTML, IGP
// PDF), the cheapest honest signal is an HTTP HEAD: read Last-Modified / ETag
// and compare Last-Modified against the `source_date` the rulebook recorded.
//
// This is deliberately shallow — it flags "go look", it does NOT extract values.
// A CMS page that reflows on every deploy will look "changed" often; a PDF with
// a stable Last-Modified is a reliable change bell. Structured per-source
// extractors (curriculum AU table, handbook FGO rules) are the next layer and
// are tracked in the enhancement dossier, not faked here.
// =============================================================================

// Formats we will not poll: gated intranet PDFs and student-personal PDFs are
// not watchable public URLs — the rulebook says so, and we respect it.
const UNWATCHABLE = new Set(["pdf-gated", "pdf-personal"]);

/**
 * @returns {Promise<{status:string, lastModified:string|null, etag:string|null, note:string}>}
 *   status ∈ manual | fresh | changed | unknown | unreachable
 */
export async function checkFreshness(source) {
  if (!source || !source.url) return { status: "unknown", lastModified: null, etag: null, note: "no url" };
  if (UNWATCHABLE.has(source.format)) {
    return { status: "manual", lastModified: null, etag: null, note: `${source.format}: supply manually when it changes` };
  }
  // The rulebook sometimes stores a URL plus a parenthetical human note; only
  // poll something that looks like a real http(s) URL.
  const url = String(source.url).split(/\s+/)[0];
  if (!/^https?:\/\//i.test(url)) {
    return { status: "manual", lastModified: null, etag: null, note: "url is a description, not a fetchable link" };
  }

  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const lastModified = res.headers.get("last-modified");
    const etag = res.headers.get("etag");
    if (!res.ok) {
      return { status: "unreachable", lastModified, etag, note: `HTTP ${res.status}` };
    }
    if (lastModified && source.source_date) {
      const lm = new Date(lastModified);
      const sd = new Date(source.source_date);
      if (!Number.isNaN(lm.valueOf()) && !Number.isNaN(sd.valueOf()) && lm > sd) {
        return { status: "changed", lastModified, etag, note: `Last-Modified ${lastModified} is newer than recorded source_date ${source.source_date}` };
      }
      return { status: "fresh", lastModified, etag, note: "no change signal since recorded source_date" };
    }
    return {
      status: "unknown",
      lastModified,
      etag,
      note: lastModified ? "server sent Last-Modified but rulebook has no source_date to compare" : "server sent no Last-Modified header",
    };
  } catch (err) {
    return { status: "unreachable", lastModified: null, etag: null, note: err?.message ?? "fetch failed" };
  }
}
