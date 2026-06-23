// ── Master timeline (30fps) ──────────────────────────────────────────────────
// Scene durations in frames. Order = render order in the <Series>.
export const SCENES = {
  coldOpen: 420, // 0:00–0:14
  idea: 690, // 0:14–0:37
  architecture: 900, // 0:37–1:07
  material: 720, // 1:07–1:31
  guardrails: 960, // 1:31–2:03
  checkpoints: 900, // 2:03–2:33
  alarms: 690, // 2:33–2:56
  human: 660, // 2:56–3:18
  swap: 810, // 3:18–3:45
  payoff: 780, // 3:45–4:11
  close: 540, // 4:11–4:29
} as const;

export type SceneKey = keyof typeof SCENES;

// Cumulative start frame of each scene.
export const SCENE_START: Record<SceneKey, number> = (() => {
  const out = {} as Record<SceneKey, number>;
  let acc = 0;
  for (const k of Object.keys(SCENES) as SceneKey[]) {
    out[k] = acc;
    acc += SCENES[k];
  }
  return out;
})();

export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);

// ── Rubric checklist (the grader's scoreboard) ───────────────────────────────
export type Tier = "MUST" | "SHOULD" | "BONUS";
export interface RubricItem {
  n: number;
  tier: Tier;
  short: string; // what shows in the rail
  tickAt: number; // GLOBAL frame when it checks off
}

const at = (scene: SceneKey, offset: number) => SCENE_START[scene] + offset;

export const RUBRIC: RubricItem[] = [
  { n: 1, tier: "MUST", short: "Four pillars, separate from the worker", tickAt: at("architecture", 740) },
  { n: 2, tier: "MUST", short: "Agent behavior changes on feedback", tickAt: at("checkpoints", 700) },
  { n: 3, tier: "MUST", short: "Guardrails declared · checkpoints pass/fail", tickAt: at("guardrails", 540) },
  { n: 4, tier: "MUST", short: "Alarms are structured output", tickAt: at("alarms", 470) },
  { n: 5, tier: "MUST", short: "Runs on a real input (my brief)", tickAt: at("idea", 470) },
  { n: 6, tier: "MUST", short: "HARNESS.md documents architecture", tickAt: at("payoff", 560) },
  { n: 7, tier: "SHOULD", short: "Swappable agent interface", tickAt: at("swap", 360) },
  { n: 8, tier: "SHOULD", short: "Checkpoints persisted · replayable", tickAt: at("checkpoints", 560) },
  { n: 9, tier: "SHOULD", short: "Human-in-the-loop escalation", tickAt: at("human", 470) },
  { n: 10, tier: "BONUS", short: "Second worker swapped in live", tickAt: at("swap", 640) },
];
