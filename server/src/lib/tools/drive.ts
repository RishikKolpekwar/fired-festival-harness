// Agent-facing Google Drive tools: find a doc by name, and share it with a
// person (resolving their email from Contacts/Gmail). The agent then texts or
// emails the returned link. Needs the Drive scope (re-consent once).
import { findDriveFiles, shareDriveFile } from "../google/drive.js";
import { lookupContacts } from "../contacts.js";
import { findEmailAddress } from "../google/gmailSend.js";
import type { Tool } from "../harness/types.js";

export const findFileTool: Tool<{ name: string }> = {
  name: "find_file",
  description:
    "Find a file in the user's Google Drive by name (e.g. 'How Neural Networks Actually Learn Full Draft v2'). Returns matching files with their share links. Use to locate a doc the user refers to by title.",
  parameters: {
    name: { type: "string", description: "The file's name or part of it", required: true },
  },
  effect: "read",
  async execute({ name }) {
    try {
      const files = await findDriveFiles(name);
      if (!files.length) return { ok: true, data: { count: 0 }, error: null, modelText: `no Drive file found matching "${name}".` };
      const lines = files.slice(0, 5).map((f) => `- ${f.name}${f.webViewLink ? ` (${f.webViewLink})` : ""}`).join("\n");
      return { ok: true, data: { count: files.length, files }, error: null, modelText: `found:\n${lines}` };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};

export const shareFileTool: Tool<{ file: string; withPerson: string; canEdit?: boolean }> = {
  name: "share_file",
  description:
    "Share a Google Drive file with someone so they can view or edit it, and return the link. Give the `file` name (e.g. 'How Neural Networks Actually Learn Full Draft v2'), `withPerson` (a contact name or email), and `canEdit` (true = editor, false = viewer; default true). Resolves the person's email automatically. After this, text or email them the returned link. Use whenever the user says 'send/share my <doc> with <person> so they can edit'.",
  parameters: {
    file: { type: "string", description: "Drive file name (or part of it)", required: true },
    withPerson: { type: "string", description: "Who to share with — a contact name or an email address", required: true },
    canEdit: { type: "boolean", description: "true for editor access (default), false for view only" },
  },
  effect: "write",
  async execute({ file, withPerson, canEdit = true }) {
    try {
      // 1) find the file
      const files = await findDriveFiles(file);
      if (!files.length) return { ok: false, data: null, error: `couldn't find a Drive file named "${file}". check the exact title.`, signals: [] };
      const target = files[0]!;

      // 2) resolve the person's email
      let email = withPerson.includes("@") ? withPerson.trim() : "";
      if (!email) {
        const card = lookupContacts(withPerson).find((c) => c.emails.length);
        email = card?.emails[0] ?? (await findEmailAddress(withPerson)) ?? "";
      }
      if (!email) return { ok: false, data: null, error: `couldn't find an email for "${withPerson}" to share with. add their email to Contacts, or give it to me.`, signals: [] };

      // 3) share
      const res = await shareDriveFile(target.id, email, canEdit ? "writer" : "reader");
      if (!res.ok) return { ok: false, data: null, error: res.error ?? "share failed", signals: [] };
      const link = res.webViewLink ?? target.webViewLink ?? "";
      return {
        ok: true,
        data: { file: target.name, sharedWith: email, role: canEdit ? "editor" : "viewer", link },
        error: null,
        modelText: `shared "${target.name}" with ${withPerson} (${email}) as ${canEdit ? "editor" : "viewer"}. link: ${link}`,
      };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};
