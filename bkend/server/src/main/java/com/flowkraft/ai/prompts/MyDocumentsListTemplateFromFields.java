package com.flowkraft.ai.prompts;

import java.util.List;

public final class MyDocumentsListTemplateFromFields {

    private MyDocumentsListTemplateFromFields() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "MY-DOCUMENTS-LIST-TEMPLATE-FROM-FIELDS",
            "Generate My Documents List Template (page-my-documents.php)",
            "Generate a PHP template for listing all documents of a custom Pods type for the logged-in user, with search and pagination. Use the provided model fields and optionally an example template.",
            List.of("page-my-documents.php", "webportal", "wordpress"),
            "Web Portal / CMS (WordPress)",
            """
You are an experienced WordPress developer with deep knowledge of the Pods Framework API and Tailwind CSS. Your task is to generate a complete, secure PHP single template for a new custom Pods content type, adapting an existing example template.

**New Pods Content Type Definition (in Plain English or PHP Code):**
[Describe or paste the new content type here, e.g., fields like employee, period, gross_amount, net_amount, associated_user. Include any optional access fields like allow_public_view, associated_groups, associated_roles.]

**Example Template to Adapt:**
[Paste the full code of an existing sample template here—choose the one most similar to your new content type (e.g., page-my-documents-paystubs.php for simple pay-related lists, page-my-documents-payslips.php for employee document lists with additional fields like department/job_title, or page-my-documents-invoices.php for billing lists with status and payment actions).]

**Instructions:**
- Adapt the example template for the new content type.
- Update all field names, labels, and data display to match the new type.
- Keep the same access control logic, layout, and Tailwind CSS styling.
- If the new type has different fields or requirements, adjust accordingly (e.g., add/remove table columns, change search fields, modify status logic).
- Output the full, ready-to-use PHP code for `page-my-documents.php`
- Ensure security, proper escaping, and WordPress/Pods best practices."""
        );
    }
}
