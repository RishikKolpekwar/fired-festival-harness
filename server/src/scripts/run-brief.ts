// CLI: generate a brief once and print it. Useful for testing without the UI.
//   npm run brief            (Claude worker)
//   npm run brief -- echo    (echo worker, no auth)
import "../lib/env.js"; // load .env first
import { generateBrief } from "../lib/harness/brief.js";
import { createClaudeWorker } from "../lib/agents/claudeAgent.js";
import { createEchoWorker } from "../lib/agents/echoAgent.js";

const which = process.argv[2] === "echo" ? createEchoWorker() : createClaudeWorker();
const brief = await generateBrief({
  emit: (e) => {
    if (e.kind === "status") console.log(`  · ${e.label} [${e.state}]`);
    if (e.kind === "checkpoint") console.log(`  ✓ checkpoint ${e.stage}: ${e.status}`);
    if (e.kind === "alarm") console.log(`  ⚠ ${e.alarm.type} (${e.alarm.severity}): ${e.alarm.context}`);
  },
  worker: which,
});

console.log("\n=== TOPLINE ===\n" + (brief.topline ?? "(none)"));
console.log("\n=== FEED (ranked) ===");
for (const it of brief.items) {
  console.log(`\n[${(it.score ?? 0).toFixed(2)}] ${it.title}${it.flagged ? " ⚠" : ""}  ${it.sourceTag ? `(${it.sourceTag})` : ""}${it.image ? " 🖼" : ""}`);
  console.log(`   ${it.summary}`);
  console.log(`   → why: ${it.whyItMatters}`);
}
console.log("\n=== ACTIONS ===");
for (const a of brief.actions) console.log(`- [${a.kind}] ${a.who ?? ""} — ${a.reason}`);
process.exit(0);
