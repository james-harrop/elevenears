# ElevenEars

**Live: [elevenears.vercel.app](https://elevenears.vercel.app)**

A live radar that ranks UK enterprises by customer-service pain, the strongest buying signal for AI voice agents.

Sales tools such as Clay and Apollo rank prospects by what the company does: hiring, funding, tech stack. ElevenEars ranks them by what the company's customers suffer: long call waits, complaints, regulator findings, outages. That is the moment a business is most likely to buy a voice agent, and no sales tool treats it as a signal.

I built it end to end as a working example of how I approach growth: find an overlooked signal, turn it into a product-specific angle, and make it usable by sales.

## What it does

- **Ranks 26 real UK enterprises** across banking (5), telecoms (9), energy (5) and insurance (7).
- **Scores each one from public evidence**: Ofcom, Citizens Advice, Which?, the Financial Ombudsman and company disclosures. Every figure links to its source and carries a date.
- **Runs a live news wire per company** (Google News RSS, refreshed every 30 minutes). Fresh stories feed the score, so the board re-ranks as news breaks.
- **Ranks two ways**: by most pain, or by most news activity in the last fortnight.
- **Opens each company into a one-page brief**: the pain, why now, why a voice agent fits, who to call (named leaders from primary sources, with LinkedIn) and a first line for outreach.

## How the score works

The board ranks by a transparent weighted pain score in [`lib/scoring.ts`](lib/scoring.ts):

`0.35 intent + 0.25 pain + 0.15 deal size + 0.15 fit + 0.10 evidence`

The same file also holds a second model for selling through partners (telcos and platforms that could embed voice for their own customers), a router that labels each account Direct, Distribution or both, and in [`lib/painSources.ts`](lib/painSources.ts) a daily check of regulator pages for newer data. Those run in the code but are not shown in the current, deliberately simple interface.

## Honesty rules built in

- Public signals only. Hypotheses are labelled as hypotheses.
- Older evidence is shown as context, never as a reason to call now.
- Buyers come from primary sources (company newsrooms, leadership pages, trade press), not scraped contact databases. Where a name could not be verified, the brief links to a LinkedIn search instead of guessing.
- Outreach lines are drafts for a person to check, never sent automatically.

## Stack

Next.js 16, React 19, TypeScript. No database: account data lives in [`data/companies.json`](data/companies.json), and live feeds are cached with `unstable_cache` and incremental regeneration. Feeds fail gracefully back to the curated data. Deployed on Vercel.

```bash
npm install
npm run dev
```

## Files

- `app/console.tsx` - the interface
- `lib/scoring.ts` - both scoring models and the motion router
- `lib/feeds.ts` - live news wire, classified by signal type
- `lib/painSources.ts` - daily regulator freshness check (not shown in the current interface)
- `data/companies.json` - the 26 accounts and their sourced evidence

Built by [James Harrop](https://jamesharrop.co), June 2026.
