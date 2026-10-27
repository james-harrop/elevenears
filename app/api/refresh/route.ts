import { revalidateTag, revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Manual "refresh now" for demos. Primary liveness is the 30-min ISR on "/".
export async function GET() {
  try {
    revalidateTag("feeds", "max");
  } catch {}
  try {
    revalidatePath("/");
  } catch {}
  return Response.json({ revalidated: true, now: new Date().toISOString() });
}
