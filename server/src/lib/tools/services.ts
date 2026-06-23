// Agent-facing self-extension tools. Solo can connect a new keyed REST API from
// chat ("connect rocketreach, key is X") and then call it (call_api). Auto-connect:
// no approval gate. The key is stored locally and only sent to that service's host.
import { connectService, listServices, callService, type AuthStyle } from "../services.js";
import type { Tool } from "../harness/types.js";

export const connectServiceTool: Tool<{ name: string; base_url: string; api_key: string; auth_style?: string; auth_name?: string; note?: string }> = {
  name: "connect_service",
  description:
    "Connect a new external API service to Solo so you can use it (e.g. RocketReach, Hunter, Clearbit). Give `name` (e.g. 'rocketreach'), `base_url` (the API root, https only, e.g. 'https://api.rocketreach.co/v2'), and `api_key`. Optionally `auth_style` ('bearer' default | 'header' | 'query') and `auth_name` (the header or query param name the service expects for the key, e.g. 'Api-Key'). After connecting, use call_api to call it. You CAN wire up new integrations this way; never tell the user you can't add API keys or integrations. Known: RocketReach uses base 'https://api.rocketreach.co/v2', auth_style 'header', auth_name 'Api-Key'.",
  parameters: {
    name: { type: "string", description: "Short service name, e.g. 'rocketreach'", required: true },
    base_url: { type: "string", description: "API root URL, https only", required: true },
    api_key: { type: "string", description: "The user's API key for the service", required: true },
    auth_style: { type: "string", description: "'bearer' (default), 'header', or 'query'" },
    auth_name: { type: "string", description: "Header or query param name for the key (e.g. 'Api-Key' for RocketReach)" },
    note: { type: "string", description: "Optional usage hint to remember (e.g. endpoint to use for email lookup)" },
  },
  effect: "write",
  async execute({ name, base_url, api_key, auth_style, auth_name, note }) {
    try {
      const svc = connectService({ name, baseUrl: base_url, apiKey: api_key, authStyle: auth_style as AuthStyle | undefined, authName: auth_name, note });
      return { ok: true, data: { name: svc.name, host: svc.host }, error: null, modelText: `connected ${svc.name}. you can now call it with call_api (host ${svc.host}). i won't repeat the key back.` };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};

export const callApiTool: Tool<{ service: string; method?: string; path: string; query?: string; body?: string; headers?: string }> = {
  name: "call_api",
  description:
    "Call an endpoint on a service you connected with connect_service. `service` is the name, `path` is the endpoint path relative to its base url (NOT a full url), `method` defaults to GET. `query`, `body`, and `headers` are JSON-encoded objects passed as strings (e.g. body '{\"name\":\"Kexun Zhang\",\"current_employer\":\"ChipAgents\"}'). The service's API key is injected automatically. Use this to actually use RocketReach/Hunter/etc., e.g. look up an email. Returns the API's JSON response.",
  parameters: {
    service: { type: "string", description: "Connected service name, e.g. 'rocketreach'", required: true },
    method: { type: "string", description: "HTTP method (GET default, POST, PUT, DELETE)" },
    path: { type: "string", description: "Endpoint path relative to the service base url, e.g. 'person/lookup'", required: true },
    query: { type: "string", description: "Query params as a JSON object string, e.g. '{\"name\":\"x\"}'" },
    body: { type: "string", description: "Request body as a JSON object string (for POST/PUT)" },
    headers: { type: "string", description: "Extra headers as a JSON object string, if the endpoint needs them" },
  },
  effect: "write",
  async execute({ service, method, path, query, body, headers }) {
    const parse = (s?: string) => {
      if (!s) return undefined;
      try { return JSON.parse(s); } catch { return undefined; }
    };
    const res = await callService(service, {
      method,
      path,
      query: parse(query) as Record<string, string | number | boolean> | undefined,
      body: parse(body),
      headers: parse(headers) as Record<string, string> | undefined,
    });
    if (!res.ok) return { ok: false, data: null, error: res.error ?? "call failed", signals: [] };
    const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    return { ok: true, data: res.data, error: null, modelText: `${service} returned (status ${res.status}):\n${text.slice(0, 5000)}` };
  },
};

export const listServicesTool: Tool<Record<string, never>> = {
  name: "list_services",
  description: "List the external API services currently connected to Solo (names and hosts, never keys). Use to check what's wired up before saying you can't do something.",
  parameters: {},
  effect: "read",
  async execute() {
    const svcs = listServices();
    return { ok: true, data: { count: svcs.length, services: svcs }, error: null, modelText: svcs.length ? svcs.map((s) => `- ${s.name} (${s.host})`).join("\n") : "no external services connected yet." };
  },
};
