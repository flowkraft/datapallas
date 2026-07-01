import { NextResponse } from "next/server";
import { getConfig, setConfig, getAllConfig } from "@/lib/db";

/**
 * GET /api/config
 * Get all config values or a specific one via ?key=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (key) {
      // An unset key is a normal "no value yet" state, not an error. Return 200
      // with a null value so callers fall back to their default without a
      // spurious 404 in the browser console. (getConfig returns null if unset.)
      const value = getConfig(key);
      return NextResponse.json({ success: true, config: { key, value } });
    }

    // Return all config
    const config = getAllConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Error getting config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get config" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config
 * Set a config value
 * Body: { key: string, value: string, description?: string }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { key, value, description } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: key and value" },
        { status: 400 }
      );
    }

    setConfig(key, value, description);
    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    console.error("Error setting config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to set config" },
      { status: 500 }
    );
  }
}
