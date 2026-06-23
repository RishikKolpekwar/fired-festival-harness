// Scrape an article's cover image from its HTML. Tries, in order: og:image,
// twitter:image, JSON-LD `image`, <link rel="image_src">, then the first large
// in-content <img>. Returns an absolute https URL, or undefined. Results are
// cached by url so repeated brief-gens don't re-scrape the same article.
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return m?.[1];
}

function toAbs(u: string, base: string): string | undefined {
  try {
    return new URL(u, base).toString().replace(/^http:\/\//, "https://");
  } catch {
    return undefined;
  }
}

// Process-lifetime cache: url → resolved image (or null when none found), so a
// re-generation reuses the result instead of re-fetching the page.
const cache = new Map<string, string | null>();

/** Pull an `image` value out of a JSON-LD blob (string | {url} | array of either). */
function imageFromJsonLd(html: string, base: string): string | undefined {
  const scripts = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const walk = (node: unknown): string | undefined => {
        if (!node) return undefined;
        if (Array.isArray(node)) {
          for (const n of node) { const r = walk(n); if (r) return r; }
          return undefined;
        }
        if (typeof node === "object") {
          const o = node as Record<string, unknown>;
          const img = o.image ?? o.thumbnailUrl;
          if (typeof img === "string") return img;
          if (Array.isArray(img) && typeof img[0] === "string") return img[0];
          if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") return (img as Record<string, string>).url;
          for (const v of Object.values(o)) { const r = walk(v); if (r) return r; }
        }
        return undefined;
      };
      const found = walk(JSON.parse(json));
      if (found) return toAbs(found, base);
    } catch {
      /* malformed JSON-LD — skip */
    }
  }
  return undefined;
}

/** First reasonably large in-content <img> (skips tiny icons/spacers/data-uris). */
function firstContentImage(html: string, base: string): string | undefined {
  const imgs = html.match(/<img[^>]+>/gi) ?? [];
  for (const tag of imgs) {
    const src = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-original");
    if (!src || /^data:/i.test(src)) continue;
    if (/(sprite|logo|icon|avatar|pixel|spacer|blank|1x1|tracking)/i.test(src)) continue;
    const w = Number(attr(tag, "width") || 0);
    const h = Number(attr(tag, "height") || 0);
    if ((w && w < 200) || (h && h < 150)) continue; // too small to be article art
    const abs = toAbs(src, base);
    if (abs) return abs;
  }
  return undefined;
}

async function scrapeOgImage(url: string): Promise<string | undefined> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; SoloBot/1.0)" },
    });
    if (!resp.ok) return undefined;
    const html = await resp.text();
    const headEnd = html.indexOf("</head>");
    const head = html.slice(0, headEnd > -1 ? headEnd : 200_000);

    // 1) og:image / twitter:image from <meta>
    const metas = head.match(/<meta[^>]+>/gi) ?? [];
    let twitter: string | undefined;
    for (const tag of metas) {
      const prop = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
      const content = attr(tag, "content");
      if (!content) continue;
      if (prop === "og:image" || prop === "og:image:secure_url" || prop === "og:image:url") return toAbs(content, url);
      if (prop === "twitter:image" || prop === "twitter:image:src") twitter = content;
    }
    if (twitter) return toAbs(twitter, url);

    // 2) <link rel="image_src">
    for (const tag of head.match(/<link[^>]+>/gi) ?? []) {
      if (/rel=["']image_src["']/i.test(tag)) {
        const href = attr(tag, "href");
        if (href) return toAbs(href, url);
      }
    }

    // 3) JSON-LD image
    const ld = imageFromJsonLd(html, url);
    if (ld) return ld;

    // 4) first large in-content <img>
    return firstContentImage(html, url);
  } catch {
    return undefined;
  }
}

export async function fetchOgImage(url: string): Promise<string | undefined> {
  if (cache.has(url)) return cache.get(url) ?? undefined;
  const img = await scrapeOgImage(url);
  cache.set(url, img ?? null);
  return img;
}

/** Backfill cover images for items that have a url but no image yet (parallel, capped). */
export async function backfillImages<T extends { url?: string; image?: string }>(items: T[]): Promise<void> {
  const need = items.filter((i) => i.url && !i.image);
  await Promise.all(
    need.map(async (i) => {
      const img = await fetchOgImage(i.url!);
      if (img) i.image = img;
    }),
  );
}
