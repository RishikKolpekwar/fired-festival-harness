// Self-extension: connected external API services. Solo can register a new keyed
// REST API from chat and call it, without new code per service. Security model:
//  - the base_url's HOST is fixed at connect time; callers pass only a relative
//    path, so a request can never be redirected to another host (no SSRF).
//  - the stored key is injected only into requests to that service's own base.
//  - the key is never returned to the model or the user.
import { db } from "./db.js";

export type AuthStyle = "header" | "bearer" | "query";

export interface Service {
  name: string;
  host: string;
  baseUrl: string;
  authStyle: AuthStyle;
  authName?: string;
  note?: string;
}

const now = () => new Date().toISOString();

function hostOf(baseUrl: string): string {
  return new URL(baseUrl).hostname;
}

/** Register (or update) a service. Upserts by name. Throws on a bad base_url. */
export function connectService(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  authStyle?: AuthStyle;
  authName?: string;
  note?: string;
}): Service {
  const name = input.name.toLowerCase().trim();
  const base = input.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("base_url must be an https URL");
  const host = hostOf(base);
  const authStyle = input.authStyle ?? "bearer";
  db.prepare(
    `INSERT INTO services (name, host, base_url, auth_style, auth_name, api_key, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET host=excluded.host, base_url=excluded.base_url,
       auth_style=excluded.auth_style, auth_name=excluded.auth_name, api_key=excluded.api_key, note=excluded.note`,
  ).run(name, host, base, authStyle, input.authName ?? null, input.apiKey.trim(), input.note ?? null, now());
  return { name, host, baseUrl: base, authStyle, authName: input.authName, note: input.note };
}

/** Public list — NEVER includes the api key. */
export function listServices(): Service[] {
  const rows = db.prepare(`SELECT name, host, base_url, auth_style, auth_name, note FROM services ORDER BY created_at DESC`).all() as Record<string, string | null>[];
  return rows.map((r) => ({
    name: String(r.name),
    host: String(r.host),
    baseUrl: String(r.base_url),
    authStyle: (r.auth_style as AuthStyle) ?? "bearer",
    authName: r.auth_name ?? undefined,
    note: r.note ?? undefined,
  }));
}

export function removeService(name: string): boolean {
  return db.prepare(`DELETE FROM services WHERE name = ?`).run(name.toLowerCase().trim()).changes > 0;
}

interface ServiceRow extends Service { apiKey: string }

function getService(name: string): ServiceRow | null {
  const r = db.prepare(`SELECT * FROM services WHERE name = ?`).get(name.toLowerCase().trim()) as Record<string, string | null> | undefined;
  if (!r) return null;
  return {
    name: String(r.name),
    host: String(r.host),
    baseUrl: String(r.base_url),
    authStyle: (r.auth_style as AuthStyle) ?? "bearer",
    authName: r.auth_name ?? undefined,
    note: r.note ?? undefined,
    apiKey: String(r.api_key),
  };
}

/**
 * Call a connected service. `path` is appended to the service's base_url; it must
 * be a relative path (no scheme, no host) so the request stays locked to the
 * service's own host. Auth is injected here; the key never leaves this function.
 */
export async function callService(
  name: string,
  req: { method?: string; path: string; query?: Record<string, string | number | boolean>; body?: unknown; headers?: Record<string, string> },
): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> {
  const svc = getService(name);
  if (!svc) return { ok: false, error: `service "${name}" is not connected. connect it first with connect_service.` };

  // Lock to the service host: reject anything that looks like an absolute URL.
  const path = req.path.trim();
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith("//")) {
    return { ok: false, error: "path must be relative to the service base_url, not a full URL." };
  }
  const url = new URL(`${svc.baseUrl}/${path.replace(/^\/+/, "")}`);
  if (url.hostname !== svc.host) return { ok: false, error: "refused: resolved host does not match the connected service." };

  const headers: Record<string, string> = { Accept: "application/json", ...(req.headers ?? {}) };
  // inject auth for this service only
  if (svc.authStyle === "bearer") headers["Authorization"] = `Bearer ${svc.apiKey}`;
  else if (svc.authStyle === "header") headers[svc.authName || "Authorization"] = svc.apiKey;
  else if (svc.authStyle === "query") url.searchParams.set(svc.authName || "api_key", svc.apiKey);

  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, String(v));

  const method = (req.method ?? "GET").toUpperCase();
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(60_000) };
  if (req.body != null && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }
    if (!resp.ok) return { ok: false, status: resp.status, error: `${name} ${resp.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}` };
    return { ok: true, status: resp.status, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
