package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildBillingPortalNext {

    private BuildBillingPortalNext() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_BILLING_PORTAL_NEXT",
            "Write My Own Billing Portal — My Data Model & Branding (Next.js/Apollo)",
            "Your own billing portal — your invoices and branding; customers log in to view and pay.",
            List.of("custom-app", "billing-portal", "nextjs", "apollo"),
            "Seed Data / Apps",
            """
Apollo — I'd like my own **billing portal** for my company. Here's what it needs.

**Company & branding**
- Company **Meridian Wholesale Ltd**; invoices come from **billing@meridianwholesale.example**.
- Look: the **`business`** theme.

**What I invoice** (EU VAT, business-to-business):
- **Customers** have a company name, contact name, **VAT id**, email, billing address, city, country and
  payment terms (e.g. `NET30`).
- **Invoices** have a number, a customer, an issue date, a due date, a status (paid / due / overdue), a
  currency (e.g. `EUR`), a PO number, a subtotal, a **VAT rate**, a **VAT amount**, a total and notes.
- Each invoice has **line items**: description, quantity, unit price, VAT rate, line total.

**What it does**
- A customer logs in and sees **only their own** invoices, with the right paid / due / overdue status.
- They can **pay** an invoice online — including from an emailed link, without logging in.
- Every invoice is a clean, **printable** document with the VAT breakdown.
- An **admin area** to manage invoices and customers.

Use your existing **building-custom-apps** skill."""
        );
    }
}
