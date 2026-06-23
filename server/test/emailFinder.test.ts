// emailFinder name resolution — the pure, network-free logic that decides what
// address gets built. Covers the "Dr. Bakre" send-failure root cause (titles were
// never stripped, so the finder resolved dr.bakre@… and failed) plus accent
// folding, credential stripping, and the ranked candidate patterns.
// Imports the exported pure helpers read-only; no Apify/Prospeo/network calls.
import { describe, it, expect } from "vitest";
import { parseName, emailCandidates } from "../src/lib/tools/emailFinder.js";

describe("parseName — strips titles/credentials so resolution doesn't get garbage", () => {
  it("drops an honorific prefix (the Dr. Bakre bug)", () => {
    // Before the fix: first='Dr.', last='Bakre' → dr.bakre@… → finder fails.
    expect(parseName("Dr. Bakre")).toEqual({ first: "bakre", last: "" });
  });

  it("drops both an honorific and a trailing credential", () => {
    expect(parseName("Dr. Asha Bakre, MD")).toEqual({ first: "asha", last: "bakre" });
    expect(parseName("Prof. John Smith PhD")).toEqual({ first: "john", last: "smith" });
  });

  it("folds diacritics to plain ascii", () => {
    expect(parseName("Gabriele Campanella")).toEqual({ first: "gabriele", last: "campanella" });
    expect(parseName("José Hernández")).toEqual({ first: "jose", last: "hernandez" });
  });

  it("handles a plain two-part name unchanged", () => {
    expect(parseName("Andrew Beck")).toEqual({ first: "andrew", last: "beck" });
  });

  it("keeps a single name as first with empty last", () => {
    expect(parseName("Bakre")).toEqual({ first: "bakre", last: "" });
  });

  it("returns empty for junk / titles-only input", () => {
    expect(parseName("")).toEqual({ first: "", last: "" });
    expect(parseName("Dr.")).toEqual({ first: "", last: "" });
  });

  it("strips punctuation inside names (O'Brien, hyphenated)", () => {
    expect(parseName("Mary O'Brien")).toEqual({ first: "mary", last: "obrien" });
    expect(parseName("Anne Smith-Jones")).toEqual({ first: "anne", last: "smithjones" });
  });
});

describe("emailCandidates — ranked corporate-format guesses", () => {
  it("leads with first.last and includes the common formats", () => {
    const c = emailCandidates("asha", "bakre", "example.com");
    expect(c[0]).toBe("asha.bakre@example.com");
    expect(c).toContain("abakre@example.com");
    expect(c).toContain("ashabakre@example.com");
    expect(c.every((e) => e.endsWith("@example.com"))).toBe(true);
  });

  it("de-duplicates and stays non-empty for a single name", () => {
    expect(emailCandidates("bakre", "", "example.com")).toEqual(["bakre@example.com"]);
    const c = emailCandidates("asha", "bakre", "example.com");
    expect(new Set(c).size).toBe(c.length);
  });

  it("returns nothing without a first name", () => {
    expect(emailCandidates("", "", "example.com")).toEqual([]);
  });
});
