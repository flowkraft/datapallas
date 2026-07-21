package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildPublishDashboard {

    private BuildPublishDashboard() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_PUBLISH_DASHBOARD",
            "Build & Publish a Dashboard (Data Canvas)",
            "Turn your exploration answers into KPI, chart and table widgets on a Data Canvas — arrange them, and publish a shareable dashboard with its own link.",
            List.of("dashboards"),
            "Ask Athena",
            """
Athena — I've been exploring my data in chat, and now I want to **keep the best answers as a real
dashboard**. Walk me through laying them out as widgets — a few **headline numbers, a trend, a chart, a
table** — on a **Data Canvas**, arranging them neatly, and **publishing it as a shareable page with its
own link**."""
        );
    }
}
