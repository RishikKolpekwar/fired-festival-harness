import { defineConfig } from "vitest/config";

// Harness test runner. Tests import the four-pillar primitives READ-ONLY (no
// edits to src/lib/harness/*) and prove them:
//   - guardrails.ts (pillar 3) — declared rules allow/deny correctly
//   - observability.ts (pillar 4) — checkpoints persist + replay, alarms structured
// setup.ts redirects the SQLite db to a throwaway temp dir so a test run can
// never touch the real data/harness.db.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Pin the timezone so the date-boundary regression test is deterministic on
    // any machine/CI: America/Chicago is Rishik's local tz and the off-by-one bug
    // only shows on the evening-CT-vs-UTC boundary.
    env: { TZ: "America/Chicago" },
  },
});
