// =============================================================================
// datagovsg.mjs  —  minimal client for the data.gov.sg datastore_search API
// =============================================================================
// Singapore government open data. Free; an API key is OPTIONAL (raises the rate
// limit only). We read it from DATA_GOV_SG_API_KEY if present and send it as the
// `x-api-key` header. No dependency: Node 18+ global fetch (CI runs Node 22).
//
// This is the transport layer for the monthly auditor (scripts/audit.mjs). It
// does I/O only — the mapping/diff logic that turns records into rulebook shapes
// lives in the per-source providers (e.g. ges.mjs) and stays pure + testable.
// =============================================================================

const BASE = "https://data.gov.sg/api/action/datastore_search";

/**
 * One page of datastore_search.
 * @returns {Promise<{fields: Array<{id:string,type:string}>, records: object[], total: number}>}
 */
async function searchPage(resource, { limit = 500, offset = 0, filters, q, sort } = {}) {
  const url = new URL(BASE);
  url.searchParams.set("resource_id", resource);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (filters) url.searchParams.set("filters", JSON.stringify(filters));
  if (q) url.searchParams.set("q", q);
  if (sort) url.searchParams.set("sort", sort);

  const headers = { accept: "application/json" };
  const key = process.env.DATA_GOV_SG_API_KEY;
  if (key) headers["x-api-key"] = key;

  const res = await fetchWithRetry(url, { headers });
  const body = await res.json();
  if (!body || body.success !== true || !body.result) {
    throw new Error(`data.gov.sg returned an unsuccessful body for ${resource}`);
  }
  const { fields = [], records = [], total = 0 } = body.result;
  return { fields, records, total: Number(total) || records.length };
}

/** Fetch every record for a resource (paginated), optionally server-filtered. */
export async function fetchAllRecords(resource, { filters, q, pageSize = 500 } = {}) {
  const out = [];
  let offset = 0;
  let total = Infinity;
  let fields = [];
  // Hard stop guards against a runaway loop if `total` is misreported.
  for (let guard = 0; out.length < total && guard < 200; guard++) {
    const page = await searchPage(resource, { limit: pageSize, offset, filters, q });
    fields = page.fields;
    total = page.total;
    out.push(...page.records);
    if (page.records.length < pageSize) break;
    offset += pageSize;
  }
  return { fields, records: out, total };
}

async function fetchWithRetry(url, init, { tries = 4, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry transient upstream failures; surface client errors immediately.
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} (non-retryable)`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === tries - 1) break;
      const wait = baseDelayMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`data.gov.sg request failed after ${tries} tries: ${lastErr?.message}`);
}
