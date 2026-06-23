import { describe, it, expect } from "vitest";
import { textToHtml } from "../src/lib/google/gmailSend.js";

// The email full-width bug: sent mail rendered as a narrow ~60-char hard-wrapped
// column. Fix = send reflowing HTML. These prove the body flows full-width while
// keeping paragraph spacing, and that escaping/linkifying are safe.
describe("textToHtml — full-width email reflow", () => {
  it("wraps each blank-line block in a reflowing <p> (paragraph spacing kept)", () => {
    const body = "Hi Dr. Stein,\n\nI'm building MedMorphIQ.\n\nBest,\nRishik";
    const html = textToHtml(body);
    // three blocks → three paragraphs
    expect(html.match(/<p /g)?.length).toBe(3);
    // each <p> carries a bottom margin so spacing survives (no \n\n collapse)
    expect(html).toContain("margin:0 0 1em 0;");
  });

  it("reflows: a paragraph is ONE continuous run, no injected hard line breaks", () => {
    const longLine =
      "this is a single long sentence that must flow to the reader's full width instead of being chopped into a sixty character column that breaks mid sentence";
    const html = textToHtml(longLine);
    // the whole sentence lives in one <p> with no <br> inside it
    expect(html).toContain(`<p style="margin:0 0 1em 0;">${longLine}</p>`);
    expect(html).not.toContain("<br>");
  });

  it("keeps intentional single newlines as <br> (e.g. a signature block)", () => {
    const html = textToHtml("Best,\nRishik\nMedMorphIQ");
    expect(html).toContain("Best,<br>Rishik<br>MedMorphIQ");
  });

  it("escapes HTML so a stray < or & can't break rendering", () => {
    const html = textToHtml("revenue < 1M & growing");
    expect(html).toContain("revenue &lt; 1M &amp; growing");
  });

  it("linkifies bare URLs (href + visible text both intact)", () => {
    const html = textToHtml("deck here: https://medmorphiq.com/deck?id=1&v=2");
    expect(html).toContain('<a href="https://medmorphiq.com/deck?id=1&amp;v=2">');
  });

  it("drops empty blocks from collapsed whitespace", () => {
    const html = textToHtml("one\n\n\n\ntwo");
    expect(html.match(/<p /g)?.length).toBe(2);
  });
});
