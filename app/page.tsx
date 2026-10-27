import { readFileSync } from "node:fs";
import path from "node:path";
import { Console } from "./console";
import type { Company } from "@/lib/format";
import { getAllFeeds } from "@/lib/feeds";
import { scoreDual } from "@/lib/scoring";

export const revalidate = 1800;

export default async function Home() {
  const raw = readFileSync(path.join(process.cwd(), "data", "companies.json"), "utf8");
  const data = JSON.parse(raw) as { companies: Company[] };

  const feeds = await getAllFeeds(data.companies);
  const now = new Date();
  const companies = data.companies.map((c) => {
    const live = feeds[c.company];
    const computed = scoreDual(
      c,
      now,
      (live?.items || []).map((i) => ({ signalType: i.signalType, ageDays: i.ageDays }))
    );
    return { ...c, computed, live };
  });

  const okFeeds = Object.values(feeds).filter((f) => f.ok);
  const asOf = okFeeds.map((f) => f.asOf).sort().reverse()[0] || now.toISOString();

  return <Console companies={companies} asOf={asOf} live={okFeeds.length > 0} />;
}
