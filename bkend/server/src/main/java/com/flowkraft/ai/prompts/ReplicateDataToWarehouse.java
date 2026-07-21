package com.flowkraft.ai.prompts;

import java.util.List;

public final class ReplicateDataToWarehouse {

    private ReplicateDataToWarehouse() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "REPLICATE_DATA_TO_WAREHOUSE",
            "Replicate My Data to a Warehouse (Real-Time)",
            "Athena sets up live replication from your everyday database into a fast ClickHouse analytics warehouse — so heavy reporting never slows your app.",
            List.of("data-warehouse", "real-time-sync"),
            "Ask Athena",
            """
Athena — I want my everyday database **mirrored into a fast analytics warehouse (ClickHouse)**, kept up
to date almost instantly, so heavy reports never slow down my live app. Explain how it works in plain
terms, then **walk me through setting it up** and checking that changes really do flow through."""
        );
    }
}
