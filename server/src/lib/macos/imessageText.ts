// Recover message text from chat.db. Modern macOS stores text in `attributedBody`
// (an archived NSAttributedString blob) instead of the `text` column for many
// messages, so we decode that when `text` is null.
export function messageText(text: string | null, attributedBody: Buffer | null): string {
  if (text && text.trim()) return text;
  return decodeAttributedBody(attributedBody);
}

export function decodeAttributedBody(buf: Buffer | null): string {
  if (!buf || buf.length === 0) return "";
  const marker = buf.indexOf("NSString", 0, "latin1");
  if (marker === -1) return "";
  // After "NSString" (8 bytes) skip 5 archive bytes; then a length-prefixed UTF8 string.
  const t = buf.subarray(marker + 8 + 5);
  if (t.length === 0) return "";
  let len: number;
  let start: number;
  if (t[0] === 0x81) {
    if (t.length < 3) return "";
    len = t.readUInt16LE(1);
    start = 3;
  } else {
    len = t[0]!;
    start = 1;
  }
  return t
    .subarray(start, start + len)
    .toString("utf8")
    .replace(/￼/g, "") // object-replacement char (attachments)
    .trim();
}
