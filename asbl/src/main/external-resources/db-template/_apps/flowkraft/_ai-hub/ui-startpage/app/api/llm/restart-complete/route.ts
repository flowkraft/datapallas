import { NextResponse } from "next/server";
import { setConfig } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/llm/restart-complete
 *
 * Clears the "letta.needsRestart" latch that update-env sets whenever the saved
 * provider key/model/base URL diverges from what the running Letta booted with.
 * Called by the /agents save flow ONLY after it has observed a full restart cycle
 * (Letta went down, came back, and reports the expected model handle) — so a
 * failed or skipped restart keeps the latch set and the next save/provision
 * attempt re-triggers the restart instead of silently running on a stale key.
 */
export async function POST() {
  setConfig("letta.needsRestart", "0", "Letta must be restarted to apply the saved LLM provider config");
  return NextResponse.json({ success: true });
}
