package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildHrPortalGrails {

    private BuildHrPortalGrails() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_HR_PORTAL_GRAILS",
            "Write a Custom Data App — HR Payslips Portal (Grails/Hermes)",
            "Your own custom data app — here an HR payslips portal (employees log in to view and print their payslips, no payments). Feel free to swap in your own, very distinct requirements.",
            List.of("custom-app", "hr-portal", "grails", "hermes"),
            "Seed Data / Apps",
            """
Hermes — this time I need an **HR payslips portal** for my employees. Think of it like a customer portal,
but for payslips — and with **no payments** (there's nothing to pay).

**Company & branding**
- Company **Larkspur Media Ltd**; it's our payroll portal, from **payroll@larkspurmedia.example**.
- Look: the **`emerald`** theme.

**My data**
- **Employees** have an employee number, full name, email, department, job title, hire date and an **end
  date** (blank while they work here, set when they leave). Their email is their login.
- **Payslips** have a number, an employee, a pay period (e.g. `2026-07`), a pay date, a currency, gross
  pay, total deductions and net pay.
- Each payslip has **lines**: an earning or a deduction, a description and an amount.

**What it does**
- An employee logs in and sees **only their own** payslips.
- They open a payslip and **print** it — a clean, self-contained document (earnings, deductions, net pay).
- **No payments anywhere.**
- An **admin area** for HR to manage employees and payslips.

(The payslips are generated, emailed and loaded into the portal by DataPallas itself — that isn't
something this portal does.)

Use your existing **building-custom-apps** skill."""
        );
    }
}
