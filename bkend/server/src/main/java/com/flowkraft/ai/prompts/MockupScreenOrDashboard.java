package com.flowkraft.ai.prompts;

import java.util.List;

public final class MockupScreenOrDashboard {

    private MockupScreenOrDashboard() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "MOCKUP_SCREEN_OR_DASHBOARD",
            "Mock Up a Screen or Dashboard",
            "See a clickable mockup of a screen or an analytics dashboard before anything's built.",
            List.of("mockups"),
            "Ask Athena",
            """
Athena — before we build anything, **mock it up so I can react to it first**. Give me a clickable mockup
of a screen (say, a customer portal page) or an **analytics dashboard**, filled with realistic sample
content — and tell me which numbers and elements you'd put on it, and why."""
        );
    }
}
