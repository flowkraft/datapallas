package com.flowkraft.ai.prompts;

import java.util.List;

public final class ShapeDataStarSchema {

    private ShapeDataStarSchema() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "SHAPE_DATA_STAR_SCHEMA",
            "Shape My Data into a Star Schema",
            "Use dbt to reshape raw analytics tables into a clean, report-ready star schema — so your reports stay simple and fast.",
            List.of("data-warehouse", "star-schema"),
            "Ask Athena",
            """
Athena — the tables in my analytics warehouse are **raw and awkward to report on**. Help me use **dbt**
to reshape them into a **clean, report-ready star schema** so my reports stay simple and fast. Explain
the approach first, then **walk me through building, running, and checking a small one**."""
        );
    }
}
