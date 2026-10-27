import { unstable_cache } from "next/cache";
import { periodFromText, type SourceInfo } from "./format";

const REG: Record<string, { name: string; cadence: string; url: string | null }> = {
  ofcom: {
    name: "Ofcom",
    cadence: "annual",
    url: "https://www.ofcom.org.uk/phones-and-broadband/service-quality/telecoms-and-pay-tv-complaints",
  },
  citizensadvice: {
    name: "Citizens Advice",
    cadence: "quarterly",
    url: "https://www.citizensadvice.org.uk/policy/publications/historic-star-rating-data/",
  },
  which: { name: "Which?", cadence: "ad hoc", url: null },
};

const fetchSource = unstable_cache(
  async (url: string | null, nowYear: number): Promise<{ label: string | null; value: number | null; ok: boolean }> => {
    if (!url) return { label: null, value: null, ok: true };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, {
        cache: "no-store",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36", Accept: "text/html" },
      });
      clearTimeout(timer);
      if (!res.ok) return { label: null, value: null, ok: false };
      const p = periodFromText(await res.text(), nowYear);
      return { label: p?.label ?? null, value: p?.value ?? null, ok: true };
    } catch {
      return { label: null, value: null, ok: false };
    }
  },
  ["pain-source-freshness-v1"],
  { revalidate: 86400, tags: ["painsources"] }
);

export async function getSourceFreshness(now: Date): Promise<Record<string, SourceInfo>> {
  const nowYear = now.getFullYear();
  const checkedAt = now.toISOString();
  const out: Record<string, SourceInfo> = {};
  await Promise.all(
    Object.entries(REG).map(async ([key, r]) => {
      const f = await fetchSource(r.url, nowYear);
      out[key] = {
        key,
        name: r.name,
        cadence: r.cadence,
        url: r.url,
        latestLabel: f.label,
        latestValue: f.value,
        checkedAt,
        ok: f.ok,
      };
    })
  );
  return out;
}
