package com.flowkraft.ai.prompts;

import java.util.List;

public final class SetupCloudBeaver {

    private SetupCloudBeaver() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "SETUP_CLOUDBEAVER",
            "Set Up CloudBeaver (SQL Workbench)",
            "Set up CloudBeaver — a visual, in-browser SQL workbench to browse and query your databases — reusing the connections you already have in DataPallas.",
            List.of("sql-browser"),
            "Ask Athena",
            """
Athena — I'd like **CloudBeaver**, a visual point-and-click SQL workbench in my browser, to explore and
manage my databases. Help me set it up, **reuse the connection details I already have in DataPallas**,
and confirm it works by browsing my tables and running a query."""
        );
    }
}
