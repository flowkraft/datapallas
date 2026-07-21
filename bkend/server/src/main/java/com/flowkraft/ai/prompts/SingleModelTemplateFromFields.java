package com.flowkraft.ai.prompts;

import java.util.List;

public final class SingleModelTemplateFromFields {

    private SingleModelTemplateFromFields() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "SINGLE-MODEL-TEMPLATE-FROM-FIELDS",
            "Generate Single Document Template (single-[model].php)",
            "Generate a secure, user-restricted PHP template for displaying a single document of a custom Pods type. Use the provided model fields and optionally an example template.",
            List.of("single-(content-type).php", "webportal", "wordpress"),
            "Web Portal / CMS (WordPress)",
            """
You are an experienced WordPress developer with deep knowledge of the Pods Framework API and Tailwind CSS. Your task is to generate a complete, secure PHP single template for a new custom Pods content type, adapting an existing example template.

**New Pods Content Type Definition (in Plain English or PHP Code):**
[Describe or paste the new content type here, e.g., fields like employee, period, gross_amount, net_amount, associated_user. Include any optional access fields like allow_public_view, associated_groups, associated_roles.]

**Example Template to Adapt:**
[Paste the full code of an existing sample template here—choose the one most similar to your new content type (e.g., single-paystub.php for pay-related documents, single-payslip.php for similar employee documents, or single-invoice.php for billing documents).]

**Instructions:**
- Adapt the example template for the new content type.
- Update all field names, labels, and data display to match the new type.
- Keep the same access control logic, layout, and Tailwind CSS styling.
- If the new type has different fields or requirements, adjust accordingly (e.g., add/remove table rows, change calculations).
- Output the full, ready-to-use PHP code for `single-{new-type}.php`.
- Ensure security, proper escaping, and WordPress/Pods best practices."""
        );
    }
}
