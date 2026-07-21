package com.flowkraft.ai.prompts;

import java.util.List;

public final class WriteRequirementsDoc {

    private WriteRequirementsDoc() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "WRITE_REQUIREMENTS_DOC",
            "Write a Requirements Doc for a New App",
            "Turn a rough idea into a clear requirements document — with a data diagram, the key screens, and what users can do — ready to hand to the build team.",
            List.of("requirements"),
            "Ask Athena",
            """
Athena — I've got a **rough idea for a new app** and I want a **clear requirements document** before
anyone starts building. Interview me about what I actually need, play it back so we agree, then write it
up — with a simple **diagram of the data**, the **key screens**, and a list of **what users can do** —
ready to hand to the team who'll build it."""
        );
    }
}
