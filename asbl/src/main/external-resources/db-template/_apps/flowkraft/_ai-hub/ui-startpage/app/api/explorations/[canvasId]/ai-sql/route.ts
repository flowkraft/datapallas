import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { lettaLocal } from "@letta-ai/vercel-ai-sdk-provider";

type RouteContext = { params: Promise<{ canvasId: string }> };

// POST /api/explorations/[canvasId]/ai-sql
// Sends a natural language prompt + schema context to AI, returns generated SQL
export async function POST(request: NextRequest, _context: RouteContext) {
  const { prompt, schemaContext, connectionType } = await request.json();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const systemPrompt = `You are a SQL expert. Generate a single SQL query based on the user's request.

Database type: ${connectionType || "SQL"}

Available schema:
${schemaContext || "No schema provided"}

Rules:
- Return ONLY the SQL query, no explanation, no markdown fences, no comments
- Use standard SQL syntax compatible with ${connectionType || "SQL"}
- Always include reasonable limits (LIMIT 500) unless the user specifies otherwise
- Use double quotes for identifiers with spaces or special characters`;

  try {
    const model = lettaLocal();

    const result = await generateText({
      model,
      providerOptions: { letta: { timeoutInSeconds: 60 } },
      system: systemPrompt,
      prompt,
    });

    const sql = result.text.trim();
    return NextResponse.json({ sql });
  } catch (e: unknown) {
    // Fallback: return a helpful error so the user can write SQL manually
    const message = e instanceof Error ? e.message : String(e);
    console.error("AI SQL generation failed:", message);
    return NextResponse.json(
      { error: "AI SQL generation failed. You can write SQL directly.", detail: message },
      { status: 500 }
    );
  }
}
