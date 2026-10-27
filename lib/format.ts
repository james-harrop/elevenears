import type { Dual } from "./scoring";
import type { FeedResult } from "./feeds";

export type Company = {
  company: string;
  sector: string;
  voice_pain: { metric: string | null; value: string | null; date: string | null; source_url: string | null };
  quotes: { text: string; source_url: string }[];
  intent_signals: { type: string; detail: string; date: string; source_url: string }[];
  buyer: { role: string; name: string | null; source_url: string | null };
  intent_score: number;
  score_rationale: string;
  why_now: string;
  scale?: "mega" | "large" | "mid";
  fit?: { level: "high" | "med"; flags?: string };
  feed_query?: string;
  target_role?: string;
  buyers?: Buyer[];
  pain_sources?: { platform: string; detail: string; source_url: string }[];
  icp_motion?: "direct" | "distribution" | "both";
  icp_note?: string;
  distribution?: { reach: string; product: string; play: string };
  platform?: { reach?: "mega" | "large" | "mid"; product?: "strong" | "emerging"; ecosystem?: "licence" | "developer" | "channel" };
  computed?: Dual;
  live?: FeedResult;
};

export type Buyer = {
  name: string;
  title: string;
  linkedin: string | null;
  one_liner: string;
  source: string;
  confidence: "high" | "medium" | "low";
};

export type Conf = { label: string; tone: "good" | "mid" | "low" };

export function parseSeconds(value?: string | null): number | null {
  if (!value) return null;
  const ms = value.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/i);
  if (ms) return +ms[1] * 60 + +ms[2];
  const s = value.match(/(\d+)\s*(?:seconds|secs|s)\b/i);
  if (s) return +s[1];
  const mOnly = value.match(/(\d+)\s*m(?:in)?\b/i);
  if (mOnly) return +mOnly[1] * 60;
  return null;
}

function host(u?: string | null): string {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}
const OFFICIAL = ["ofcom.org.uk", "citizensadvice.org.uk", "which.co.uk", "financial-ombudsman.org.uk"];
const AGGREGATOR = ["rocketreach.co", "theorg.com"];

export function sourceStrength(c: Company): Conf {
  const ph = host(c.voice_pain?.source_url);
  const painScore = OFFICIAL.some((d) => ph.includes(d)) ? 2 : ph ? 1 : 0;
  let intentScore = 0;
  for (const s of c.intent_signals) {
    const h = host(s.source_url);
    if (!h) continue;
    intentScore = Math.max(intentScore, h.includes("maxcontact") ? 1 : 2);
  }
  const total = painScore + intentScore;
  if (total >= 3) return { label: "High", tone: "good" };
  if (total === 2) return { label: "Medium", tone: "mid" };
  return { label: "Low", tone: "low" };
}

export function buyerConfidence(c: Company): Conf {
  if (c.buyers?.length) {
    const best = c.buyers.some((b) => b.confidence === "high")
      ? "high"
      : c.buyers.some((b) => b.confidence === "medium")
        ? "medium"
        : "low";
    if (best === "high") return { label: "Verified", tone: "good" };
    if (best === "medium") return { label: "Likely (press)", tone: "mid" };
    return { label: "Needs verification", tone: "low" };
  }
  const h = host(c.buyer?.source_url);
  if (!c.buyer?.name) return { label: "Likely persona", tone: "mid" };
  if (AGGREGATOR.some((d) => h.includes(d))) return { label: "Needs verification", tone: "low" };
  if (h) return { label: "Verified", tone: "good" };
  return { label: "Needs verification", tone: "low" };
}

export function linkedinSearch(c: Company): string {
  const role = c.target_role || "Chief Customer Officer";
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.company} "${role}"`)}`;
}

export function painFreshness(c: Company): Conf {
  const d = c.voice_pain?.date || "";
  if (/202[56]/.test(d)) return { label: "Current", tone: "good" };
  if (/20(1\d|2[01234])/.test(d)) return { label: "Historic but relevant", tone: "mid" };
  if (!c.voice_pain?.value && c.quotes?.length) return { label: "Indicative (reviews)", tone: "mid" };
  return { label: "Needs refresh", tone: "low" };
}
export function painCurrent(c: Company): boolean {
  return painFreshness(c).tone === "good";
}

function firstName(name?: string | null): string {
  return name ? name.split(" ")[0] : "there";
}
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
}
function greet(c: Company): string {
  if (c.buyers && c.buyers.length) {
    return c.buyers[0].name.replace(/\s*\(.*\)\s*/, "").split(" ")[0];
  }
  return buyerConfidence(c).tone === "good" ? firstName(c.buyer?.name) : "there";
}
function topSignal(c: Company) {
  const order = ["hiring", "ai-cx-announcement", "leadership-change", "funding", "regulatory-pressure", "other"];
  return [...c.intent_signals].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0];
}

function shortName(c: Company): string {
  return c.company.replace(/\s*\(.*\)\s*/, "").trim();
}

// The subject line is the headline - crafted from the sharpest TRUE hook (D&AD Copy Book: one idea, specific, human, earns the open).
function subjectLine(c: Company): string {
  const name = shortName(c);
  const aiSig = c.intent_signals.find((s) => s.type === "hiring" || s.type === "ai-cx-announcement");
  const hasPain = !!c.voice_pain?.value || (c.quotes?.length || 0) > 0;
  if (c.icp_motion === "distribution") return `The Deutsche Telekom play, on your network`;
  if (aiSig && hasPain && painCurrent(c)) return `AI's on your roadmap. Your phone queue didn't get the memo.`;
  if (aiSig) return `The first call type I'd point your new AI at`;
  if (hasPain && painCurrent(c)) return `The phone keeps showing up in your one-star reviews`;
  return `A sharper way into ${name}'s support queue`;
}

export function draftEmail(c: Company): string {
  const name = shortName(c);
  const sig = topSignal(c);
  const obs = sig ? `One thing caught my eye - ${clip(sig.detail, 150)}` : `I've been looking at how ${name} runs phone support`;

  if (c.icp_motion === "distribution") {
    return [
      `Subject: ${subjectLine(c)}`,
      ``,
      `Hi ${greet(c)},`,
      ``,
      `${obs}.`,
      ``,
      `Here's the bigger idea, though. Deutsche Telekom didn't just buy voice AI - it built its Magenta Call Assistant on ElevenLabs and ran it across its own network. ${name} has the same reach. The voice becomes something you offer your customers, not only something you run in-house - one build, millions of end-users.`,
      ``,
      `I sketched what that could look like for ${name}. Worth a short conversation?`,
      ``,
      `James`,
    ].join("\n");
  }

  // When the signal is an AI / hiring push, never imply their AI is failing - point at the part it hasn't reached.
  const aiPush = sig?.type === "ai-cx-announcement" || sig?.type === "hiring";
  const tension =
    !aiPush && (c.voice_pain?.value || c.quotes?.length)
      ? painCurrent(c)
        ? ` - while your customers are still describing long holds and having to repeat themselves`
        : ` - while public reviews keep circling back to the phone`
      : ``;
  const wedge = aiPush
    ? `The part I'd point that at first: the live phone queue, usually the last place an AI CX programme reaches. An agent there captures intent, urgency and context before anyone joins the queue, and hands the human the full picture. Revolut cut time-to-resolution by roughly 8× doing exactly that.`
    : `The part worth a voice team's attention: an agent that captures intent, urgency and context on first contact, before anyone joins the queue, and hands the human the full picture, so customers never start again. Revolut cut time-to-resolution by roughly 8× doing exactly that.`;
  return [
    `Subject: ${subjectLine(c)}`,
    ``,
    `Hi ${greet(c)},`,
    ``,
    `${obs}${tension}.`,
    ``,
    wedge,
    ``,
    `I mapped where it could fit ${name}'s journeys. Worth a look?`,
    ``,
    `James`,
  ].join("\n");
}

export type SourceInfo = {
  key: string;
  name: string;
  cadence: string;
  url: string | null;
  latestLabel: string | null;
  latestValue: number | null;
  checkedAt: string;
  ok: boolean;
};

// Most-recent period referenced in a string -> comparable value (year*4 + quarterIndex).
export function periodFromText(text?: string | null, nowYear = 2026): { value: number; label: string } | null {
  if (!text) return null;
  let best: { value: number; label: string } | null = null;
  const consider = (value: number, label: string) => {
    if (!best || value > best.value) best = { value, label };
  };
  for (const m of text.matchAll(/Q([1-4])\s*'?\s*(20\d{2})/g)) {
    const y = +m[2], q = +m[1];
    if (y < 2018 || y > nowYear) continue;
    consider(y * 4 + (q - 1), `Q${q} ${y}`);
  }
  if (!best) {
    for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
      const y = +m[1];
      if (y < 2018 || y > nowYear) continue;
      consider(y * 4 + 3, `${y}`);
    }
  }
  return best;
}
