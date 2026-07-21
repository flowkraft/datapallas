package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildBillingPortalBackend {

    private BuildBillingPortalBackend() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_BILLING_PORTAL_BACKEND",
            "Write My Billing Portal Backend — Overdue Reminders (Spring Boot/Hephaestus)",
            "Automatically flags overdue invoices and emails a payment reminder each day.",
            List.of("custom-app", "billing-portal", "backend", "hephaestus"),
            "Seed Data / Apps",
            """
Hephaestus — I've got my **billing portal** (Meridian Wholesale Ltd) and I need a **daily background job**
for it: any invoice that's still unpaid past its due date should be marked **overdue**, and that customer
should get a short **payment-reminder email**. The original invoice already went out when it was issued —
this is the follow-up chase.

- Only chase genuinely overdue, still-unpaid invoices, and only **once** each — never nag a paid one.
- The reminder links back to the portal so they can pay.

Use your existing **building-custom-apps** skill."""
        );
    }
}
