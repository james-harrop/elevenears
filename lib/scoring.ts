import {
  type Company,
  type Conf,
  parseSeconds,
  sourceStrength,
  buyerConfidence,
  painFreshness,
} from "./format";

export type SignalKind =
  | "hiring"
  | "ai-cx-announcement"
  | "leadership-change"
  | "funding"
  | "regulatory-pressure"
  | "other";

export const SCORING = {
  weights: { intent: 0.35, pain: 0.25, dealSize: 0.15, fit: 0.15, evidence: 0.1 },
  intentBase: {
    hiring: 90,
    "ai-cx-announcement": 85,
    "leadership-change": 60,
    funding: 55,
    "regulatory-pressure": 35,
    other: 25,
  } as Record<string, number>,
  recencyBuckets: [
    [30, 1.0],
    [90, 0.85],
    [180, 0.7],
    [365, 0.5],
  ] as [number, number][],
  recencyFallback: 0.3,
  multiSignalBonus: 0.15,
  liveDampen: 0.45,
  painMaxSeconds: 1200,
  painSeverityCeil: 60,
  painNoMetricBase: 20,
  painFreshMult: { good: 1.0, mid: 0.7, low: 0.45 } as Record<string, number>,
  painQuoteBump: 6,
  painQuoteBumpMax: 18,
  painRegulatorBump: 15,
  dealSizeMap: { mega: 95, large: 75, mid: 50 } as Record<string, number>,
  fitMap: { high: 90, med: 65 } as Record<string, number>,
  toneScore: { good: 100, mid: 60, low: 25 } as Record<string, number>,
};

// Platform mode = distribution fit. A different question, so a different model:
// not "are their customers in pain?" but "could they embed and resell the voice at scale?"
export const PLATFORM_SCORING = {
  weights: { reach: 0.3, product: 0.35, ecosystem: 0.2, strategic: 0.15 },
  reachMap: { mega: 95, large: 78, mid: 55 } as Record<string, number>,
  productMap: { strong: 92, emerging: 65 } as Record<string, number>,
  ecosystemMap: { licence: 90, developer: 80, channel: 75 } as Record<string, number>,
  strategicBase: 72,
};

const OFFICIAL = ["ofcom.org.uk", "citizensadvice.org.uk", "which.co.uk", "financial-ombudsman.org.uk"];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function host(u?: string | null): string {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

// Take the most-recent plausible date out of a messy string.
export function parseSignalDate(raw?: string | null, now: Date = new Date()): Date | null {
  if (!raw) return null;
  const cap = now.getTime() + 730 * 86400000; // allow up to ~2y future (signals can be upcoming)
  const cands: number[] = [];
  const push = (d: Date) => {
    const t = d.getTime();
    if (!isNaN(t) && t <= cap && d.getFullYear() >= 2000) cands.push(t);
  };
  // D Month YYYY
  for (const m of raw.matchAll(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo != null) push(new Date(+m[3], mo, +m[1]));
  }
  // Month YYYY
  for (const m of raw.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{4})/g)) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo != null) push(new Date(+m[2], mo, 1));
  }
  // Qn YYYY
  for (const m of raw.matchAll(/Q([1-4])\s*'?\s*(\d{4})/gi)) {
    push(new Date(+m[2], +m[1] * 3 - 1, 1));
  }
  // bare years
  if (!cands.length) {
    for (const m of raw.matchAll(/(20\d{2})/g)) push(new Date(+m[1], 6, 1));
  }
  if (!cands.length) return null;
  return new Date(Math.max(...cands));
}

function recencyMult(ageDays: number): number {
  if (ageDays <= 30) return 1.0;
  for (const [maxAge, mult] of SCORING.recencyBuckets) if (ageDays <= maxAge) return mult;
  return SCORING.recencyFallback;
}

function ageOf(date: Date | null, now: Date): number {
  return date ? (now.getTime() - date.getTime()) / 86400000 : 9999;
}

export type LiveSignal = { signalType: string; ageDays: number };

export function intentScore(c: Company, now: Date, live: LiveSignal[] = []): number {
  const vals: number[] = [];
  for (const s of c.intent_signals || []) {
    const base = SCORING.intentBase[s.type] ?? SCORING.intentBase.other;
    vals.push(base * recencyMult(ageOf(parseSignalDate(s.date, now), now)));
  }
  for (const it of live) {
    if (it.signalType === "other") continue;
    const base = SCORING.intentBase[it.signalType] ?? SCORING.intentBase.other;
    vals.push(base * recencyMult(it.ageDays) * SCORING.liveDampen);
  }
  if (!vals.length) return 0;
  vals.sort((a, b) => b - a);
  const top = vals[0];
  const rest = vals.slice(1).reduce((a, b) => a + b, 0);
  return Math.min(100, top + rest * SCORING.multiSignalBonus);
}

export function painScore(c: Company): number {
  const sec = parseSeconds(c.voice_pain?.value);
  const hasVal = !!c.voice_pain?.value || (c.quotes?.length || 0) > 0;
  let sev =
    sec != null
      ? Math.min(SCORING.painSeverityCeil, (sec / SCORING.painMaxSeconds) * SCORING.painSeverityCeil)
      : hasVal
        ? SCORING.painNoMetricBase
        : 0;
  sev *= SCORING.painFreshMult[painFreshness(c).tone] ?? 0.45;
  const quoteBump = Math.min((c.quotes?.length || 0) * SCORING.painQuoteBump, SCORING.painQuoteBumpMax);
  const reg = OFFICIAL.some((d) => host(c.voice_pain?.source_url).includes(d)) ? SCORING.painRegulatorBump : 0;
  return Math.min(100, sev + quoteBump + reg);
}

function tone(c: Conf): number {
  return SCORING.toneScore[c.tone] ?? 25;
}

// ---- Pain mode (direct customer) ----
export type SubScores = { intent: number; pain: number; dealSize: number; fit: number; evidence: number };
export type ScoreBreakdown = {
  score: number;
  sub: SubScores;
  contrib: SubScores;
  topDriver: keyof SubScores;
};

export function scoreCompany(c: Company, now: Date = new Date(), live: LiveSignal[] = []): ScoreBreakdown {
  const sub: SubScores = {
    intent: intentScore(c, now, live),
    pain: painScore(c),
    dealSize: SCORING.dealSizeMap[c.scale ?? "mid"] ?? 50,
    fit: SCORING.fitMap[c.fit?.level ?? "med"] ?? 65,
    evidence: Math.round((tone(sourceStrength(c)) + tone(buyerConfidence(c)) + tone(painFreshness(c))) / 3),
  };
  const w = SCORING.weights;
  const contrib: SubScores = {
    intent: w.intent * sub.intent,
    pain: w.pain * sub.pain,
    dealSize: w.dealSize * sub.dealSize,
    fit: w.fit * sub.fit,
    evidence: w.evidence * sub.evidence,
  };
  const score = Math.round(
    contrib.intent + contrib.pain + contrib.dealSize + contrib.fit + contrib.evidence
  );
  const topDriver = (Object.keys(contrib) as (keyof SubScores)[]).reduce((a, b) =>
    contrib[a] >= contrib[b] ? a : b
  );
  return { score, sub, contrib, topDriver };
}

// ---- Platform mode (distribution partner) ----
export type PlatSub = { reach: number; product: number; ecosystem: number; strategic: number };
export type PlatBreakdown = {
  score: number;
  sub: PlatSub;
  contrib: PlatSub;
  topDriver: keyof PlatSub;
};

// Roadmap / "we're already building conversational AI" signals — the same announcements
// that flag pain also flag a partner who could embed it. Recency-weighted, capped.
function strategicScore(c: Company, now: Date, live: LiveSignal[] = []): number {
  const vals: number[] = [];
  for (const s of c.intent_signals || []) {
    if (s.type !== "ai-cx-announcement") continue;
    vals.push(PLATFORM_SCORING.strategicBase * recencyMult(ageOf(parseSignalDate(s.date, now), now)));
  }
  for (const it of live) {
    if (it.signalType !== "ai-cx-announcement") continue;
    vals.push(PLATFORM_SCORING.strategicBase * recencyMult(it.ageDays) * SCORING.liveDampen);
  }
  if (!vals.length) return 0;
  vals.sort((a, b) => b - a);
  return Math.min(100, vals[0] + vals.slice(1).reduce((a, b) => a + b, 0) * SCORING.multiSignalBonus);
}

export function platformScore(c: Company, now: Date = new Date(), live: LiveSignal[] = []): PlatBreakdown {
  const p = c.platform;
  // Reach falls back to company scale — every big business has a base; only product/ecosystem
  // separate a distribution partner from a large account that simply has lots of customers.
  const reachTier = p?.reach ?? c.scale ?? "mid";
  const sub: PlatSub = {
    reach: PLATFORM_SCORING.reachMap[reachTier] ?? 55,
    product: p?.product ? PLATFORM_SCORING.productMap[p.product] ?? 0 : 0,
    ecosystem: p?.ecosystem ? PLATFORM_SCORING.ecosystemMap[p.ecosystem] ?? 0 : 0,
    strategic: strategicScore(c, now, live),
  };
  const w = PLATFORM_SCORING.weights;
  const contrib: PlatSub = {
    reach: w.reach * sub.reach,
    product: w.product * sub.product,
    ecosystem: w.ecosystem * sub.ecosystem,
    strategic: w.strategic * sub.strategic,
  };
  const score = Math.round(contrib.reach + contrib.product + contrib.ecosystem + contrib.strategic);
  const topDriver = (Object.keys(contrib) as (keyof PlatSub)[]).reduce((a, b) =>
    contrib[a] >= contrib[b] ? a : b
  );
  return { score, sub, contrib, topDriver };
}

// ---- Routing: which motion does this account belong in? ----
export type Motion = "direct" | "distribution" | "dual";
export type Dual = {
  pain: ScoreBreakdown;
  platform: PlatBreakdown;
  motion: Motion;
  primary: number; // headline score = score of the routed motion
};

export function routeMotion(painScoreV: number, platformScoreV: number): Motion {
  const P = painScoreV, L = platformScoreV;
  if (P >= 58 && L >= 58) return "dual";
  if (L > P && L >= 55) return "distribution";
  return "direct";
}

export function scoreDual(c: Company, now: Date = new Date(), live: LiveSignal[] = []): Dual {
  const pain = scoreCompany(c, now, live);
  const platform = platformScore(c, now, live);
  const motion = routeMotion(pain.score, platform.score);
  const primary =
    motion === "distribution" ? platform.score : motion === "dual" ? Math.max(pain.score, platform.score) : pain.score;
  return { pain, platform, motion, primary };
}
