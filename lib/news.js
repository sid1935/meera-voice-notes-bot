// Free Google News lookup via its public RSS search feed — no account or
// API key required. Pulls the top result for a search phrase: headline,
// source, date, link, and a one-line summary (from the article's own meta
// description when reachable, falling back to the headline otherwise).

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0 (compatible; MeeraVoiceNotesBot/1.0)";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), ms)
    ),
  ]);
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return null;
  return match[1]
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml))) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    items.push({
      title: decodeXmlEntities(stripHtml(title)),
      link: decodeXmlEntities(stripHtml(link)),
      pubDate: extractTag(block, "pubDate"),
      source: extractTag(block, "source"),
    });
  }
  return items;
}

function splitHeadlineAndSource(title, fallbackSource) {
  // Google News RSS titles are usually formatted "Headline - Source".
  const idx = title.lastIndexOf(" - ");
  if (idx > 0) {
    return {
      headline: title.slice(0, idx).trim(),
      source: (fallbackSource || title.slice(idx + 3)).trim(),
    };
  }
  return { headline: title, source: fallbackSource || "Unknown source" };
}

function formatDate(pubDate) {
  if (!pubDate) return null;
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return pubDate;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Google News RSS links point at a news.google.com interstitial that
// redirects to the publisher via client-side JS, not an HTTP redirect — so
// fetching it directly just returns Google's own generic boilerplate
// description rather than anything about the actual article. Filter that
// out rather than passing it off as a real summary.
const GENERIC_GOOGLE_NEWS_DESCRIPTION =
  /comprehensive,?\s*up-to-date news coverage/i;

async function extractMetaDescription(url) {
  try {
    const res = await withTimeout(
      fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
      }),
      REQUEST_TIMEOUT_MS
    );
    if (!res.ok) return null;

    const html = await res.text();
    const og = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    );
    const meta = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    const raw = og?.[1] || meta?.[1];
    if (!raw) return null;

    const description = decodeXmlEntities(raw).trim();
    if (GENERIC_GOOGLE_NEWS_DESCRIPTION.test(description)) return null;

    return description;
  } catch {
    return null;
  }
}

export async function fetchTopNewsArticle(searchPhrase) {
  if (!searchPhrase || !searchPhrase.trim()) return null;

  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    searchPhrase
  )}&hl=en-US&gl=US&ceid=US:en`;

  const res = await withTimeout(
    fetch(rssUrl, { headers: { "User-Agent": USER_AGENT } }),
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new Error(`Google News RSS request failed: ${res.status}`);
  }

  const xml = await res.text();
  const items = parseRssItems(xml);
  if (!items.length) return null;

  const top = items[0];
  const { headline, source } = splitHeadlineAndSource(top.title, top.source);
  const summary = (await extractMetaDescription(top.link)) || headline;

  return {
    headline,
    source,
    date: formatDate(top.pubDate),
    url: top.link,
    summary,
  };
}
