// Process-level safety net for the harness. A stray async error must NEVER kill
// the process (KeepAlive should be a last resort, not a babysitter). But we must
// NOT blanket-swallow: a real bug has to surface loudly.
//
// The one expected, by-design rejection is the Claude agent SDK's `AbortError`:
// when a generation is aborted (the loop's wall-clock cap, or the 8 parallel
// brief scouts each aborting to bound slow sources), the SDK's control-channel
// write (ProcessTransport.write in handleControlRequest) is a fire-and-forget
// promise the SDK never catches, so it surfaces here LATE as an unhandled
// rejection. That abort is intentional, not a fault — swallow it quietly so it
// doesn't spam the error log dozens of times per brief-gen. Everything else is
// logged at full volume so genuine failures stay visible.

/** True only for the agent-sdk's intentional abort (the one we suppress). */
export function isExpectedAbort(reason: unknown): boolean {
  return (reason as { name?: string } | null | undefined)?.name === "AbortError";
}

/** Handle one process-level error: drop the expected abort, log everything else. */
export function handleProcessError(label: string, reason: unknown, log: Pick<Console, "error"> = console): void {
  if (isExpectedAbort(reason)) return; // intentional agent-sdk abort — not a fault
  log.error(`[${label}] harness kept alive:`, reason);
}

/** Install the top-level guards so no stray async error can exit the process. */
export function installProcessGuards(): void {
  process.on("uncaughtException", (err) => handleProcessError("uncaughtException", err));
  process.on("unhandledRejection", (reason) => handleProcessError("unhandledRejection", reason));
}
