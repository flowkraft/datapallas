package com.flowkraft.ai.prompts;

import java.util.List;

public final class ExploreMyData {

    private ExploreMyData() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "EXPLORE_MY_DATA",
            "Explore My Data in Plain English",
            "Ask questions about your data in plain English — Athena writes the SQL and shows the answer as a table or a chart.",
            List.of("data-exploration"),
            "Ask Athena",
            """
Athena — I'd like to **explore my data just by asking questions in plain English** — I don't want to
write SQL myself. For each question, show me the **SQL you ran** and the answer as a **table or a
chart**, whichever reads best. And when I run out of ideas, **suggest what's worth looking at next**."""
        );
    }
}
