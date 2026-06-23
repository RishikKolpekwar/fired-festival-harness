// MedMorphIQ one-pager auto-attach. Any outreach (email or iMessage) that
// mentions MedMorphIQ gets the one-pager attached automatically.
import { existsSync, readFileSync } from "node:fs";
import { config } from "./config.js";

export function mentionsMedMorphIQ(text: string): boolean {
  return /medmorph\s?iq|medmorph/i.test(text);
}

export interface Attachment {
  filename: string;
  base64: string; // standard base64
  mime: string;
  path: string;
}

/** The MedMorphIQ one-pager as an attachment, or null if missing. */
export function onePagerAttachment(): Attachment | null {
  if (!existsSync(config.onePagerPath)) return null;
  try {
    return {
      filename: "MedMorphIQ-OnePager.pdf",
      base64: readFileSync(config.onePagerPath).toString("base64"),
      mime: "application/pdf",
      path: config.onePagerPath,
    };
  } catch {
    return null;
  }
}

/** The one-pager IF this outreach is about MedMorphIQ, else null. */
export function onePagerFor(text: string): Attachment | null {
  return mentionsMedMorphIQ(text) ? onePagerAttachment() : null;
}
