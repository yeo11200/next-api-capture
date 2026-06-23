import type { ResolvedCaptureConfig } from "@shinjinseop/shared";

type Redaction = ResolvedCaptureConfig["redaction"];

/**
 * Normalize a Headers | plain object | entries-iterable into a plain object,
 * applying allowlist/blocklist masking. Never throws.
 */
export function redactHeaders(
  source: HeadersLike | undefined,
  redaction: Redaction,
): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = headerEntries(source);
  const hasAllowlist = redaction.headerAllowlist.length > 0;
  const allow = new Set(redaction.headerAllowlist.map((h) => h.toLowerCase()));
  const block = new Set(redaction.headerBlocklist);

  for (const [rawKey, value] of entries) {
    const key = rawKey.toLowerCase();
    if (hasAllowlist && !allow.has(key)) {
      out[key] = redaction.maskValue;
      continue;
    }
    if (block.has(key)) {
      out[key] = redaction.maskValue;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Apply size cap + pattern masking to a body string. */
export function redactBody(
  body: string,
  redaction: Redaction,
): { body: string; truncated: boolean } {
  let truncated = false;
  let result = body;

  for (const pattern of redaction.maskPatterns) {
    try {
      result = result.replace(new RegExp(pattern, "g"), redaction.maskValue);
    } catch {
      // ignore invalid regex
    }
  }

  // Byte-accurate cap (UTF-8).
  const encoded = new TextEncoder().encode(result);
  if (encoded.length > redaction.maxBodyBytes) {
    const slice = encoded.slice(0, redaction.maxBodyBytes);
    result = new TextDecoder().decode(slice);
    truncated = true;
  }

  return { body: result, truncated };
}

type HeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | Iterable<[string, string]>
  | null;

function headerEntries(source: HeadersLike | undefined): Array<[string, string]> {
  if (!source) return [];
  // Headers / any object exposing forEach((value,key))
  if (typeof (source as Headers).forEach === "function" && !Array.isArray(source)) {
    const acc: Array<[string, string]> = [];
    (source as Headers).forEach((value: string, key: string) => acc.push([key, value]));
    return acc;
  }
  // Iterable of entries
  if (typeof (source as any)[Symbol.iterator] === "function") {
    return Array.from(source as Iterable<[string, string]>);
  }
  // Plain object
  return Object.entries(source as Record<string, string | string[] | undefined>).map(
    ([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")],
  );
}
