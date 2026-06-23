// Google Drive: find a file by name and share it with someone. Needs the
// `drive` scope (re-consent via `npm run google-auth` after adding it).
import { getAccessToken, hasGoogleAuth } from "./auth.js";

const API = "https://www.googleapis.com/drive/v3";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

/** Find Drive files whose name matches `query` (best match first, by recency). */
export async function findDriveFiles(query: string): Promise<DriveFile[]> {
  if (!hasGoogleAuth()) return [];
  const token = await getAccessToken();
  // Drive query: name contains each significant word. Escape single quotes.
  const safe = query.replace(/'/g, "\\'");
  const q = `name contains '${safe}' and trashed = false`;
  const url = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&orderBy=modifiedTime desc&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`drive search ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { files?: DriveFile[] };
  const files = data.files ?? [];
  // Rank: prefer a file whose name contains the most query words.
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return files.sort((a, b) => scoreName(b.name, words) - scoreName(a.name, words));
}

function scoreName(name: string, words: string[]): number {
  const n = name.toLowerCase();
  return words.reduce((s, w) => s + (n.includes(w) ? 1 : 0), 0);
}

/** Share a Drive file with a person by email. role: 'writer' (edit) | 'reader' (view). */
export async function shareDriveFile(
  fileId: string,
  email: string,
  role: "writer" | "reader" = "writer",
): Promise<{ ok: boolean; webViewLink?: string; error?: string }> {
  if (!hasGoogleAuth()) return { ok: false, error: "Google not connected" };
  try {
    const token = await getAccessToken();
    // sendNotificationEmail=true so they actually get the Google share email too.
    const resp = await fetch(`${API}/files/${fileId}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role, type: "user", emailAddress: email }),
    });
    if (!resp.ok) return { ok: false, error: `drive share ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    // fetch the shareable link
    const meta = await fetch(`${API}/files/${fileId}?fields=webViewLink&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    const link = meta.ok ? ((await meta.json()) as { webViewLink?: string }).webViewLink : undefined;
    return { ok: true, webViewLink: link };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
