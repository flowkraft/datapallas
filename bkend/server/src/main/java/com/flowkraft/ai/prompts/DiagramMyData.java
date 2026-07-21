package com.flowkraft.ai.prompts;

import java.util.List;

public final class DiagramMyData {

    private DiagramMyData() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "DIAGRAM_MY_DATA",
            "Diagram My Data & Processes",
            "Get a diagram of how your database tables connect, or a flowchart of a business process, drawn live in the chat.",
            List.of("diagrams"),
            "Ask Athena",
            """
Athena — draw me a picture to help me understand things. For example: a **diagram of how my database
tables connect**, or a **flowchart of a business process** (like order → invoice → payment). Render it
right here in the chat so I can see it straight away."""
        );
    }
}
