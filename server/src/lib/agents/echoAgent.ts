// ─────────────────────────────────────────────────────────────────────────────
// SECOND WORKER (bonus: prove portability)
// A dependency-free, no-auth heuristic worker implementing the SAME Agent
// interface. It still goes through the harness's guardrail-wrapped callTool, so
// every pillar (tools/guardrails/observability/loop) applies unchanged. Swapping
// this in for the Claude worker requires ZERO harness changes.
// ─────────────────────────────────────────────────────────────────────────────
import type { Agent, AgentInput, AgentOutput, Signal, ToolResult } from "../harness/types.js";

export function createEchoWorker(): Agent {
  return {
    id: "echo-heuristic",
    async run(input: AgentInput): Promise<AgentOutput> {
      const q = input.prompt.toLowerCase();
      const used: string[] = [];
      const signals: Signal[] = [];

      // Naive intent routing → still flows through harness guardrails + tracing.
      const plan: { name: string; args: Record<string, unknown> }[] = [];
      if (/job|intern|recruit|role|hiring/.test(q)) plan.push({ name: "search_jobs", args: { sinceDays: 7 } });
      if (/message|text|imessage|reply/.test(q)) plan.push({ name: "read_imessage", args: { sinceHours: 24 } });
      if (/podcast|20vc|episode|substack/.test(q)) plan.push({ name: "fetch_rss", args: {} });
      if (plan.length === 0) plan.push({ name: "search_news", args: { query: input.prompt, numResults: 6 } });

      for (const step of plan) {
        if (input.signal.aborted) break;
        const res: ToolResult = await input.callTool(step.name, step.args);
        used.push(step.name);
        if (res.signals) signals.push(...res.signals);
      }

      const top = signals.slice(0, 6);
      const text =
        top.length === 0
          ? "couldn't pull anything relevant for that — sources may be degraded."
          : `here's what i found:\n\n` +
            top.map((s, i) => `${i + 1}. ${s.title}${s.url ? `\n   ${s.url}` : ""}`).join("\n");

      // Stream it out so the UI behaves identically to the Claude worker.
      input.emit({ kind: "token", text });

      return {
        text,
        usedTools: [...new Set(used)],
        citedSources: top.map((s) => ({ id: s.id, url: s.url, source: s.source })),
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
}
