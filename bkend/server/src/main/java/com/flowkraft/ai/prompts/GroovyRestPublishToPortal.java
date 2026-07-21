package com.flowkraft.ai.prompts;

import java.util.List;

public final class GroovyRestPublishToPortal {

    private GroovyRestPublishToPortal() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "GROOVY-REST-PUBLISH-TO-PORTAL",
            "Generate Groovy Script to Publish Documents to DataPallas Portal via REST API",
            "Generate a Groovy script for DataPallas that publishes documents to the web portal using the WordPress/Pods REST API, including authentication. The script must also check for the existence of the target WordPress user and create the user if not already present.",
            List.of("curl_(content-type)2portal.groovy", "webportal", "wordpress"),
            "Web Portal / CMS (WordPress)",
            """
You are an experienced Groovy developer with deep knowledge of DataPallas, WordPress REST API, and Pods Framework integration. Your task is to generate a complete, robust Groovy script that publishes documents to the \
DataPallas Portal via WordPress / Pods REST API, adapting an existing example script.

**New Pods Content Type Definition (in Plain English or PHP Code):**
[Describe or paste the new content type here, e.g., fields like order_id, order_date, customer_id, customer_name, freight, line_items_json, subtotal, tax, grand_total, associated_user, document_status, was_viewed_by.]

**Example Groovy Script to Adapt:**
[Paste the full code of an existing sample Groovy script here—choose the one most similar to your new content type (e.g., curl_paystub2portal.groovy for paystub, curl_payslip2portal.groovy for payslip, or curl_invoice2portal.groovy for invoice).]

**Instructions:**
- Adapt the example script for the new content type and its fields.
- Structure the script in clear, logical steps (e.g., Step 1: Check/Create User, Step 2: Prepare Document Data, Step 3: Publish Document via REST API).
- Update all field names, labels, and data mapping to match the new type.
- Ensure the script checks if the target WordPress user exists (by username or email) and creates the user if not already present, handling authentication as needed.
- Use HTTP POST for publishing, handle authentication, and log the result.
- Output the full, ready-to-use Groovy script for publishing documents to the portal.
- Ensure the script is modular, robust, and easy to adapt for different scenarios."""
        );
    }
}
