package com.flowkraft.ai.prompts;

import java.util.List;

public final class WriteCustomProcessingScript {

    private WriteCustomProcessingScript() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "WRITE_CUSTOM_PROCESSING_SCRIPT",
            "Write a Custom Processing Script",
            "Have Athena write a custom script for a processing step — encrypt, transform, or reshape your documents or data.",
            List.of("scripting"),
            "Ask Athena",
            """
Athena — I need a small **custom step** in how my documents are processed — for example, locking each
PDF with a per-person password, transforming the data, or reshaping the output. Ask me what you need to
know, then **write the script for me**, ready to drop in."""
        );
    }
}
