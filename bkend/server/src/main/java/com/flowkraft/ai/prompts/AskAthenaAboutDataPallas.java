package com.flowkraft.ai.prompts;

import java.util.List;

public final class AskAthenaAboutDataPallas {

    private AskAthenaAboutDataPallas() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "ASK_ATHENA_ABOUT_DATAPALLAS",
            "Ask Athena About DataPallas",
            "New here? Ask what DataPallas can do and how to get started.",
            List.of("product-help"),
            "Ask Athena",
            """
Athena — I'm new to DataPallas. In plain terms, **what can it do for me, and where should I start?**
Give me a short tour of the main things it's good at — exploring data, reports, dashboards, sending
documents out — and your advice on the first thing worth trying with my own data."""
        );
    }
}
