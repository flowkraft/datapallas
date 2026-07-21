package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildPivotReport {

    private BuildPivotReport() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_PIVOT_REPORT",
            "Build a Pivot / Analytics Report",
            "Build an interactive pivot report over your analytics data — plan it, connect your data, test it, and share.",
            List.of("reporting", "data-warehouse"),
            "Ask Athena",
            """
Athena — help me build an **interactive pivot report** over my analytics data — the kind where I can
drag things around and slice the numbers different ways. Plan a useful one (what goes down the side,
across the top, and the figure in the middle), then **walk me through creating it, connecting my data,
and testing it** — and, if I want, putting it on a web page."""
        );
    }
}
