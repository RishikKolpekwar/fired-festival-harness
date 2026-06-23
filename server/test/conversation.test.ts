// Conversation continuity — the multi-turn memory bug: a Telegram/iMessage
// exchange (ask → clarifying question → answer) must keep turn-1 context on
// turn 2. The thread-aware path (runChat, and chatOnce once it's thread-aware)
// must hand the worker the prior turns via `history`, not start stateless.
// Driven by a recording MockWorker — proves the governance carries context.
import { describe, it, expect } from "vitest";
import { runChat, chatOnce } from "../src/lib/harness/loop.js";
import type { Agent, AgentInput } from "../src/lib/harness/types.js";

/** A worker that records the `history` it was handed each turn, and answers. */
function recordingWorker(seen: AgentInput["history"][]): Agent {
  return {
    id: "recorder",
    async run(input) {
      seen.push(input.history);
      return { text: "noted", usedTools: [], citedSources: [], usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

describe("runChat — conversation continuity across turns", () => {
  it("hands turn 2 the turn-1 exchange (request + answer), not an empty history", async () => {
    const seen: AgentInput["history"][] = [];
    const worker = recordingWorker(seen);

    await runChat({ threadId: "t-continuity", message: "my favorite color is blue", emit: () => {}, worker });
    await runChat({ threadId: "t-continuity", message: "what did i just tell you?", emit: () => {}, worker });

    // turn 1 saw no prior history; turn 2 must see the turn-1 user + assistant turns
    expect(seen[0]).toHaveLength(0);
    const turn2 = seen[1]!;
    expect(turn2.length).toBeGreaterThanOrEqual(2);
    const text = turn2.map((h) => h.content).join(" | ");
    expect(text).toContain("my favorite color is blue"); // the original request survived
    expect(turn2.some((h) => h.role === "assistant")).toBe(true); // and its own prior reply
  });

  it("keeps separate threads isolated (no cross-chat bleed)", async () => {
    const seenA: AgentInput["history"][] = [];
    const seenB: AgentInput["history"][] = [];
    await runChat({ threadId: "t-chatA", message: "secret A", emit: () => {}, worker: recordingWorker(seenA) });
    await runChat({ threadId: "t-chatB", message: "hello from B", emit: () => {}, worker: recordingWorker(seenB) });
    // chat B's first turn must NOT see chat A's message
    expect(seenB[0]).toHaveLength(0);
  });
});

describe("chatOnce — the Telegram/iMessage bridge path (the actual bug)", () => {
  it("carries context across turns when given a threadKey (request → clarify → answer coheres)", async () => {
    const seen: AgentInput["history"][] = [];
    const worker = recordingWorker(seen);
    await chatOnce("my dog is named rex", worker, "telegram:123");
    await chatOnce("what's my dog's name?", worker, "telegram:123");

    expect(seen[0]).toHaveLength(0);
    const turn2 = seen[1]!;
    expect(turn2.length).toBeGreaterThanOrEqual(2);
    expect(turn2.map((h) => h.content).join(" | ")).toContain("my dog is named rex");
  });

  it("stays stateless without a threadKey (legacy one-off)", async () => {
    const seen: AgentInput["history"][] = [];
    const worker = recordingWorker(seen);
    await chatOnce("hello", worker);
    await chatOnce("again", worker);
    expect(seen[0]).toHaveLength(0);
    expect(seen[1]).toHaveLength(0); // no thread → no memory carried
  });

  it("isolates different chat keys (telegram vs imessage don't bleed)", async () => {
    const seen: AgentInput["history"][] = [];
    const worker = recordingWorker(seen);
    await chatOnce("from telegram", worker, "telegram:1");
    await chatOnce("from imessage", worker, "imessage:+15125550000");
    expect(seen[1]).toHaveLength(0); // different key → its own fresh thread
  });

  it("reuses the SAME thread for a repeated threadKey (persistent mapping)", async () => {
    const seen: AgentInput["history"][] = [];
    const worker = recordingWorker(seen);
    await chatOnce("first", worker, "telegram:persist");
    await chatOnce("second", worker, "telegram:persist");
    await chatOnce("third", worker, "telegram:persist");
    // by turn 3 the history should hold turns 1 + 2 (user+assistant each) = 4 entries
    expect(seen[2]!.length).toBeGreaterThanOrEqual(4);
  });
});
