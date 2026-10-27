"use client";

import { useRef, useState } from "react";
import type { Company } from "@/lib/format";
import type { Headline } from "@/lib/feeds";
import { draftEmail, linkedinSearch } from "@/lib/format";

type Live = { ok: boolean; items: Headline[]; asOf: string };
type Scored = Company & { computed?: { pain?: { score: number } }; live?: Live };

type Props = {
  companies: Scored[];
  asOf: string;
  live: boolean;
};

function sectorOf(c: Company): "Banking" | "Telecoms" | "Energy" | "Insurance" {
  const s = (c.sector || "").toLowerCase();
  if (s.includes("telecom")) return "Telecoms";
  if (s.includes("energy")) return "Energy";
  if (s.includes("insur")) return "Insurance";
  return "Banking";
}

const FIX: Record<string, string> = {
  Banking:
    "Fraud and payment calls can't sit in a queue. An ElevenAgents voice agent triages and verifies instantly, escalating only the genuinely complex - closing the wait regulators keep flagging.",
  Telecoms:
    "Outage and billing spikes overwhelm the contact centre. A voice agent absorbs the surge and handles the routine majority, keeping humans for retention and the hard cases.",
  Energy:
    "Billing, meter and complaint volumes swamp support. A voice agent answers status and routine queries 24/7, so advisers focus on vulnerable and complex customers.",
  Insurance:
    "Claims and renewals stack up at peak. A voice agent captures first notice of loss, answers status and routes the rest - shrinking the wait that drives the bad reviews.",
};

const FEEDS_LIVE = ["Google News - per-account wire"];
const FEEDS_CURATED = ["Ofcom complaints", "Which? mystery-shops", "Financial Ombudsman", "Trustpilot", "Downdetector outages"];

function painScore(c: Scored): number {
  return c.computed?.pain?.score ?? (c as { intent_score?: number }).intent_score ?? 0;
}
function headline(c: Company): string {
  if (c.pain_sources && c.pain_sources.length) {
    return c.pain_sources.map((p) => `${p.platform}: ${p.detail}`).join("  ·  ");
  }
  return c.voice_pain?.value || c.voice_pain?.metric || "Customer-service pressure";
}
function liveItems(c: Scored): Headline[] {
  return (c.live?.items || []).filter((i) => i.title && i.url).slice(0, 3);
}
function freshCount(c: Scored): number {
  return (c.live?.items || []).filter((i) => i.isNew).length;
}
function ageLabel(d: number): string {
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 400) return `${d}d ago`;
  return "";
}
function initials(name: string): string {
  return name.replace(/\s*\(.*\)\s*/, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function topByPain(companies: Scored[]): string | null {
  const top = [...companies].sort((a, b) => painScore(b) - painScore(a))[0];
  return top ? top.company : null;
}

function Row({ c, rank, open, onToggle, byActivity }: { c: Scored; rank: number; open: boolean; onToggle: () => void; byActivity: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "done" | "manual">("idle");
  const preRef = useRef<HTMLPreElement>(null);
  const sec = sectorOf(c);
  const score = painScore(c);
  const buyer = c.buyers?.[0];
  const op = (Math.min(100, Math.max(0, score)) / 100) * 0.62 + 0.12;
  const news = liveItems(c);
  const fresh = freshCount(c);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draftEmail(c));
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      const pre = preRef.current;
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      setCopyState("manual");
      setTimeout(() => setCopyState("idle"), 2600);
    }
  }

  return (
    <li className="row">
      <button className="rowhead" onClick={onToggle} aria-expanded={open}>
        <span className="rank">{String(rank).padStart(2, "0")}</span>
        <span className="co">
          <span className="coname">{c.company}</span>
          <span className="copain">{headline(c)}</span>
          <span className="cometa">
            <span className="cosec">{sec}</span>
            {fresh > 0 && <span className="livetag"><i className="ld" aria-hidden="true" />{fresh} new</span>}
          </span>
        </span>
        <span className="score">
          {byActivity ? (
            <>
              <span className={`schip act${fresh > 0 ? " hot" : ""}`}>{fresh}</span>
              <span className="slab">new</span>
            </>
          ) : (
            <>
              <span className="schip" style={{ background: `rgba(var(--accent-rgb), ${op})` }}>{score}</span>
              <span className="slab">pain</span>
            </>
          )}
          <span className={`xp${open ? " open" : ""}`} aria-hidden="true">+</span>
        </span>
      </button>

      {open && (
        <div className="detail">
          <div className="dgrid">
          <div className="dcol">
          <div className="dsec">
            <p className="dk"><i className="ld" aria-hidden="true" /> Live now <span className="dkn">· Google News wire</span></p>
            {news.length ? (
              <ul className="lnews">
                {news.map((n, i) => (
                  <li className="lnew" key={i}>
                    <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                    <span className="lmeta">{n.source}{ageLabel(n.ageDays) ? ` · ${ageLabel(n.ageDays)}` : ""}{n.isNew ? " · NEW" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dbody mut">No fresh headlines in the window right now - the curated signals below are the standing evidence.</p>
            )}
          </div>

          <div className="dsec">
            <p className="dk">The pain</p>
            {c.pain_sources && c.pain_sources.length ? (
              <ul className="plist">
                {c.pain_sources.map((p, i) => (
                  <li className="pitem" key={i}>
                    <span className="ptag">{p.platform}</span>
                    {p.source_url ? (
                      <a href={p.source_url} target="_blank" rel="noreferrer">{p.detail}</a>
                    ) : (
                      p.detail
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {c.voice_pain && (
              <p className={c.pain_sources?.length ? "hist" : "dbody"}>
                {c.voice_pain.metric}: <b>{c.voice_pain.value}</b>.{" "}
                {c.voice_pain.source_url ? (
                  <span className="src">
                    <a href={c.voice_pain.source_url} target="_blank" rel="noreferrer">{c.voice_pain.date || "source"}</a>
                  </span>
                ) : (
                  <span className="src">{c.voice_pain.date}</span>
                )}
              </p>
            )}
          </div>

          </div>
          <div className="dcol">
          <div className="dsec">
            <p className="dk">Why now</p>
            <p className="callout now">{c.why_now}</p>
          </div>

          <div className="dsec">
            <p className="dk">Why a voice agent</p>
            <p className="callout fix">{FIX[sec]}</p>
          </div>

          <div className="dsec">
            <p className="dk">Who to call</p>
            {buyer ? (
              <div className="who">
                <span className="avatar" aria-hidden="true">{initials(buyer.name)}</span>
                <span className="whobody">
                  <span className="whoname">{buyer.name}</span>
                  <span className="whorole">{buyer.title}</span>
                  <span className="wholink">
                    <a href={buyer.linkedin || linkedinSearch(c)} target="_blank" rel="noreferrer">LinkedIn ↗</a>
                  </span>
                </span>
              </div>
            ) : (
              <p className="dbody mut">
                {c.target_role || "Customer / contact-centre lead"}{" "}-{" "}
                <a href={linkedinSearch(c)} target="_blank" rel="noreferrer">find on LinkedIn ↗</a>
              </p>
            )}
          </div>
          </div>
          </div>

          <div className="dsec opensec">
            <p className="dk">A first line in</p>
            <pre className="opener" ref={preRef}>{draftEmail(c)}</pre>
            <button className={`copy${copyState === "done" ? " done" : ""}`} onClick={copy} aria-live="polite">
              {copyState === "done" ? "Copied ✓" : copyState === "manual" ? "Selected - press ⌘C" : "Copy email"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const SECTORS = ["All", "Banking", "Telecoms", "Energy", "Insurance"] as const;

export function Console({ companies, asOf, live }: Props) {
  const [filter, setFilter] = useState<(typeof SECTORS)[number]>("All");
  const [sort, setSort] = useState<"pain" | "active">("pain");
  const [openId, setOpenId] = useState<string | null>(() => topByPain(companies));

  const byActivity = sort === "active";
  const ranked = [...companies].sort((a, b) =>
    byActivity ? freshCount(b) - freshCount(a) || painScore(b) - painScore(a) : painScore(b) - painScore(a)
  );
  const shown = ranked.filter((c) => filter === "All" || sectorOf(c) === filter);

  const totalNew = companies.reduce((n, c) => n + freshCount(c), 0);
  const movers = [...companies]
    .filter((c) => freshCount(c) > 0)
    .sort((a, b) => freshCount(b) - freshCount(a))
    .slice(0, 3);

  const asOfLabel = (() => {
    try {
      return new Date(asOf).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
      });
    } catch {
      return "";
    }
  })();

  return (
    <div className="wrap">
      <div className="top">
        <span className="brand">Eleven<b>Ears</b></span>
        <span className="asof">
          <i className={`ld${live ? "" : " off"}`} aria-hidden="true" /> {live ? "live" : "cached"} · refreshed {asOfLabel}
        </span>
      </div>

      <header className="hero">
        <p className="eyebrow">UK voice-AI buying signals · live</p>
        <h1 className="h1">The companies whose customers can&rsquo;t get through.</h1>
        <p className="sub">A live radar that ranks UK enterprises by customer-service pain - the strongest buying signal for AI voice agents.</p>
        <p className="diff">
          <b>Clay finds who&rsquo;s hiring. ElevenEars finds who&rsquo;s failing their customers</b>{" "}- and why they&rsquo;ll buy.
        </p>
        <p className="lede">
          Every name is a real UK enterprise. The ranking is built from public evidence of customer pain that
          no sales tool treats as a signal - and a live news wire that moves the board as stories break.
          Click any company for the proof, the buyer, and a first line in.
        </p>
      </header>

      <div className="feeds">
        <span className="feedk">Plugs into</span>
        {FEEDS_LIVE.map((f) => (
          <span className="feedchip on" key={f}><i className="ld" aria-hidden="true" />{f}</span>
        ))}
        {FEEDS_CURATED.map((f) => (
          <span className="feedchip" key={f}>{f}</span>
        ))}
        <span className="feedlegend"><i className="ld" aria-hidden="true" /> live wire · others curated &amp; dated</span>
      </div>

      <div className="radar">
        <i className="ld" aria-hidden="true" />
        {totalNew > 0 ? (
          <>
            <b>{totalNew} new signals</b> on the wire this fortnight
            {movers.length > 0 && <> · most active: {movers.map((m) => m.company).join(" · ")}</>}
          </>
        ) : (
          <>Quiet on the wire this fortnight - the curated pain signals are standing.</>
        )}
      </div>

      <div className="controls">
        <div className="filters">
          {SECTORS.map((s) => (
            <button key={s} className={`fbtn${filter === s ? " on" : ""}`} onClick={() => setFilter(s)} aria-pressed={filter === s}>
              {s}
            </button>
          ))}
        </div>
        <div className="sortwrap">
          <span className="sortk">Rank by</span>
          <button className={`fbtn${sort === "pain" ? " on" : ""}`} onClick={() => setSort("pain")} aria-pressed={sort === "pain"}>Most pain</button>
          <button className={`fbtn${sort === "active" ? " on" : ""}`} onClick={() => setSort("active")} aria-pressed={sort === "active"}>Most active</button>
        </div>
      </div>
      <p className="count">Showing {shown.length} of {companies.length} accounts · ranked by {byActivity ? "live activity" : "pain score"}</p>

      <ol className="list">
        {shown.map((c, i) => (
          <Row
            key={c.company}
            c={c}
            rank={i + 1}
            byActivity={byActivity}
            open={openId === c.company}
            onToggle={() => setOpenId(openId === c.company ? null : c.company)}
          />
        ))}
      </ol>
      {shown.length === 0 && (
        <p className="empty">Nothing in this sector on the current board - switch back to All.</p>
      )}

      <footer className="foot">
        <b>How to read this.</b>{" "}The news wire is live (Google News, per account, refreshed every 30 minutes) -
        it moves the board as stories break, and &ldquo;most active&rdquo; ranks by it. The pain evidence is curated
        from public regulator and review sources and labelled with its date. Buyer names are real and verified to a
        primary source. Drafts are never sent - they&rsquo;re a starting line, not an outbox.<br />
        A workflow experiment that shows how I&rsquo;d find ElevenLabs&rsquo; next UK customers - not a finished product.
      </footer>
    </div>
  );
}
