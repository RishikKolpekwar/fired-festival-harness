// ─────────────────────────────────────────────────────────────────────────────
// WORKER — Claude Agent SDK adapter (swappable)
// Implements the harness `Agent` interface. Authenticates via the Pro plan's
// OAuth token (CLAUDE_CODE_OAUTH_TOKEN) — no API credits. The harness exposes
// its tools to this worker as an in-process MCP server whose handlers call back
// into the guardrail-wrapped `callTool`, so the worker never bypasses a pillar.
// ─────────────────────────────────────────────────────────────────────────────
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z, type ZodRawShape } from "zod";
import type { Agent, AgentInput, AgentOutput, Tool } from "../harness/types.js";

const MCP_SERVER = "solo";

// Map our lightweight param spec → a zod raw shape for the SDK tool() helper.
function toZodShape(spec: Tool["parameters"]): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const [key, p] of Object.entries(spec)) {
    let zt: z.ZodTypeAny;
    switch (p.type) {
      case "number":
        zt = z.number();
        break;
      case "boolean":
        zt = z.boolean();
        break;
      case "array":
        zt = z.array(z.any());
        break;
      default:
        zt = z.string();
    }
    shape[key] = p.required ? zt.describe(p.description) : zt.optional().describe(p.description);
  }
  return shape;
}

export function createClaudeWorker(): Agent {
  return {
    id: "claude-agent-sdk",
    async run(input: AgentInput): Promise<AgentOutput> {
      // Build in-process MCP tools that delegate to the harness's callTool.
      const sdkTools = input.toolSpecs.map((spec) =>
        tool(spec.name, spec.description, toZodShape(spec.parameters), async (args) => {
          const result = await input.callTool(spec.name, args as Record<string, unknown>);
          // Hand the model a compact, parseable result (errors-as-data).
          const text = result.ok
            ? summarizeForModel(spec.name, result)
            : `ERROR: ${result.error ?? "tool failed"}`;
          return { content: [{ type: "text", text }] };
        }),
      );

      const server = createSdkMcpServer({ name: MCP_SERVER, version: "0.1.0", tools: sdkTools });
      const allowed = input.toolSpecs.map((s) => `mcp__${MCP_SERVER}__${s.name}`);

      const usedTools = new Set<string>();
      let finalText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      const conversation =
        input.history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n") +
        (input.history.length ? "\n\n" : "") +
        input.prompt;

      const stream = query({
        prompt: conversation,
        options: {
          model: input.model,
          systemPrompt: input.system,
          mcpServers: { [MCP_SERVER]: server },
          allowedTools: allowed,
          tools: [], // disable built-in Claude Code tools; only our material handling
          includePartialMessages: true,
          maxTurns: input.maxTurns,
          abortController: toController(input.signal),
          permissionMode: "bypassPermissions", // our action-guardrails are the gate
        },
      });

      for await (const msg of stream) {
        if (msg.type === "stream_event") {
          const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } };
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            input.emit({ kind: "token", text: ev.delta.text });
          }
        } else if (msg.type === "assistant") {
          for (const block of msg.message.content as { type: string; name?: string }[]) {
            if (block.type === "tool_use" && block.name) usedTools.add(block.name.replace(`mcp__${MCP_SERVER}__`, ""));
          }
        } else if (msg.type === "result") {
          if (msg.subtype === "success") finalText = msg.result;
          inputTokens = msg.usage?.input_tokens ?? 0;
          outputTokens = msg.usage?.output_tokens ?? 0;
          // surface SDK-side caps to the harness via thrown sentinel
          if (msg.subtype === "error_max_turns") throw new MaxTurnsError();
          if (msg.subtype === "error_max_budget_usd") throw new BudgetError(msg.total_cost_usd);
        }
      }

      return {
        text: finalText,
        usedTools: [...usedTools],
        citedSources: [],
        usage: { inputTokens, outputTokens },
      };
    },
  };
}

export class MaxTurnsError extends Error {
  constructor() {
    super("worker hit max turns");
  }
}
export class BudgetError extends Error {
  constructor(public costUsd: number) {
    super(`worker exceeded budget ($${costUsd.toFixed(2)})`);
  }
}

function toController(signal: AbortSignal): AbortController {
  const ac = new AbortController();
  if (signal.aborted) ac.abort();
  else signal.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}

function summarizeForModel(toolName: string, result: { data: unknown; signals?: unknown[]; modelText?: string }): string {
  // Full-text tools (e.g. fetch_url) hand their content to the model verbatim.
  if (result.modelText) return `${toolName} returned:\n${result.modelText.slice(0, 6000)}`;
  const n = result.signals?.length ?? 0;
  const items = (result.signals as { title: string; body: string; url?: string }[] | undefined) ?? [];
  const lines = items
    .slice(0, 12)
    .map((s, i) => `${i + 1}. ${s.title}${s.url ? ` (${s.url})` : ""}\n   ${s.body.slice(0, 1200)}`)
    .join("\n");
  return `${toolName} returned ${n} item(s).\n${lines}`;
}
