package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildPdfReport {

    private BuildPdfReport() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_PDF_REPORT",
            "Build a PDF Report",
            "Design a new PDF report over your business data, end to end — from the data to the finished layout.",
            List.of("reporting"),
            "Ask Athena",
            """
Athena — help me **build a new PDF report** over my business data, from start to finish. First suggest a
genuinely useful report my data can actually support, then **walk me through it step by step**: set up
the report, connect it to my data, and design how the finished PDF looks."""
        );
    }
}
