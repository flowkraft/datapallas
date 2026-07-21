package com.flowkraft.ai.prompts;

import java.util.List;

public final class SetupDocumentDistribution {

    private SetupDocumentDistribution() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "SETUP_DOCUMENT_DISTRIBUTION",
            "Set Up Document Distribution",
            "Athena walks you through sending your generated documents out — by email, to shared folders, and more.",
            List.of("distribution"),
            "Ask Athena",
            """
Athena — help me **send my generated documents out to the right people** — by email, and to shared
folders or the cloud if I need it. Ask me what I've got (my data, or one big file, and what identifies
each recipient) and give me the **simplest setup that works**."""
        );
    }
}
