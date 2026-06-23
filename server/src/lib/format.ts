// Output formatting rules. Hard-enforced — the model is asked to follow them,
// but we also strip after the fact so a stray dash never reaches the user.

/** Remove hyphens and dashes per the user's rule. Never used in any message/prose. */
export function noHyphens(s: string): string {
  return s
    .replace(/[—–]/g, ", ") // em / en dash → comma
    .replace(/[^\S\n]+-[^\S\n]+/g, ", ") // spaced hyphen " - " → comma (same line only)
    .replace(/([A-Za-z])-([A-Za-z])/g, "$1 $2") // intra-word hyphen → space (go-to-market → go to market)
    .replace(/ ,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/[^\S\n]{2,}/g, " ") // collapse runs of spaces/tabs, but PRESERVE newlines (keep paragraph breaks)
    .trim();
}

/** Clean a drafted message/email body: no hyphens, no markdown, tidy whitespace.
 *  URLs are protected so the no-hyphens rule never corrupts a link (a doc id like
 *  '1a-wtCep' must stay literal, not become '1a wtCep'). */
export function cleanDraft(s: string): string {
  const stripped = stripMarkdown(s);
  // shield every URL behind a placeholder before noHyphens runs
  const urls: string[] = [];
  const guarded = stripped.replace(/https?:\/\/[^\s)<>"']+/g, (u) => {
    urls.push(u);
    return `${urls.length - 1}`;
  });
  let out = noHyphens(guarded);
  out = out.replace(/(\d+)/g, (_m, i) => urls[Number(i)] ?? _m); // restore URLs verbatim
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * De-slop an EMAIL body: strip the AI cold-email tells the model sometimes
 * leaves in despite the prompt. Deterministic, so it fixes old stored drafts too.
 */
export function deslopEmail(s: string): string {
  let t = s;
  // "Dear X" → "Hi X" (academics trigger the formal opener)
  t = t.replace(/\bDear\b/g, "Hi");
  // soften the canned ask phrasings
  t = t.replace(/Would you be open to (a )?(brief |quick )?call\??/gi, "could we do a quick call?");
  t = t.replace(/I would genuinely love/gi, "I'd like");
  t = t.replace(/I would love/gi, "I'd like");
  // delete the worst filler phrases outright
  t = t.replace(/\bNo pitch\.?\s*/gi, "");
  t = t.replace(/\bI hope this (email |message )?finds you well\.?\s*/gi, "");
  t = t.replace(/\bI came across\b/gi, "I saw");
  t = t.replace(/\b(really |genuinely )?resonated\b/gi, "stood out");
  t = t.replace(/\b(comparing|compare) notes\b/gi, (m) => (m.toLowerCase().startsWith("comparing") ? "swapping notes" : "swap notes"));
  t = t.replace(/\bFor some context, (I am|I'm)\b/gi, "I'm");
  t = t.replace(/\b(I would|I'd) love to pick your brain\b/gi, "I'd like your take");
  // drop a trailing signature block: a bare url line and title-only lines
  t = t
    .split("\n")
    .filter((line) => {
      const l = line.trim().toLowerCase();
      if (/^[a-z0-9.-]+\.(com|ai|io|org|net|co)$/.test(l)) return false; // bare url line
      if (/^(founder|co-?founder|ceo|cto|president)\b.*medmorphiq/i.test(line.trim())) return false; // "Founder, MedMorphIQ"
      return true;
    })
    .join("\n");
  return t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/** Strip Markdown to clean plain text (for channels that can't render it, e.g. iMessage). */
export function stripMarkdown(s: string): string {
  return s
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w])[*_]([^*_\n]+)[*_](?=[^\w]|$)/g, "$1$2")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .trim();
}

/** Convert Markdown to Telegram-safe HTML (renders bold/italic/code/links). */
export function toTelegramHtml(md: string): string {
  let t = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/```([\s\S]*?)```/g, (_m, c) => `<pre>${c.trim()}</pre>`);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>"); // headings → bold
  t = t.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, "$1<i>$2</i>");
  t = t.replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, "$1<i>$2</i>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/^\s*[-*]\s+/gm, "• ");
  return t;
}
