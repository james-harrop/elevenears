import { unstable_cache } from "next/cache";
import type { Company } from "./format";

export type SignalType =
  | "hiring"
  | "ai-cx-announcement"
  | "leadership-change"
  | "regulatory-pressure"
  | "other";

export type Headline = {
  title: string;
  url: string;
  source: string;
  published: string;
  ageDays: number;
  isNew: boolean;
  signalType: SignalType;
};

export type FeedResult = { company: string; items: Headline[]; asOf: string; ok: boolean };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function classify(title: string): SignalType {
  const t = title.toLowerCase();
  if (/\bhir(e|es|ing)\b|recruit|vacanc|\bjobs?\b|\broles?\b|headcount/.test(t)) return "hiring";
  if (/appoint|names? |joins? as|new chief|chief customer|chief executive|\bceo\b|\bcco\b|\bcxo\b|steps down/.test(t))
    return "leadership-change";
  if (/\bai\b|artificial intelligence|automat|chatbot|voice agent|virtual agent|agentic|conversational/.test(t))
    return "ai-cx-announcement";
  if (/ofcom|\bfca\b|ofgem|fine[sd]?\b|complaint|regulator|consumer duty|outage|\bfraud\b/.test(t))
    return "regulatory-pressure";
  return "other";
}

export function buildQuery(c: Company): string {
  if (c.feed_query) return c.feed_query;
  return `"${c.company}" (customer service OR contact centre OR complaints OR AI OR fraud OR outage)`;
}

function feedUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
}

function parseRss(xml: string, now: Date): Headline[] {
  const out: Headline[] = [];
  const chunks = xml.split(/<item>/).slice(1);
  for (const raw of chunks.slice(0, 12)) {
    const block = raw.split(/<\/item>/)[0];
    const grab = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decode(m[1]) : "";
    };
    let title = grab("title");
    const url = grab("link");
    const source = grab("source");
    const pub = grab("pubDate");
    if (!title || !url) continue;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const d = pub ? new Date(pub) : null;
    const ageDays = d && !isNaN(d.getTime()) ? (now.getTime() - d.getTime()) / 86400000 : 9999;
    out.push({
      title,
      url,
      source: source || host(url),
      published: d && !isNaN(d.getTime()) ? d.toISOString() : "",
      ageDays: Math.round(ageDays),
      isNew: ageDays < 14 && ageDays > -2,
      signalType: classify(title),
    });
  }
  out.sort((a, b) => a.ageDays - b.ageDays);
  return out.slice(0, 4);
}

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "news";
  }
}

const fetchCompanyFeed = unstable_cache(
  async (query: string, company: string): Promise<FeedResult> => {
    const asOf = new Date().toISOString();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(feedUrl(query), {
        cache: "no-store",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevenEars/1.0)" },
      });
      clearTimeout(timer);
      if (!res.ok) return { company, items: [], asOf, ok: false };
      const items = parseRss(await res.text(), new Date());
      return { company, items, asOf, ok: true };
    } catch {
      return { company, items: [], asOf, ok: false };
    }
  },
  ["google-news-feed-v1"],
  { revalidate: 1800, tags: ["feeds"] }
);

export async function getAllFeeds(companies: Company[]): Promise<Record<string, FeedResult>> {
  const settled = await Promise.allSettled(
    companies.map(async (c) => [c.company, await fetchCompanyFeed(buildQuery(c), c.company)] as const)
  );
  const map: Record<string, FeedResult> = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") map[r.value[0]] = r.value[1];
    else map[companies[i].company] = { company: companies[i].company, items: [], asOf: new Date().toISOString(), ok: false };
  });
  return map;
}
