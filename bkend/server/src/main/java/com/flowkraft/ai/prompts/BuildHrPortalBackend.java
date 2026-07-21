package com.flowkraft.ai.prompts;

import java.util.List;

public final class BuildHrPortalBackend {

    private BuildHrPortalBackend() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "BUILD_HR_PORTAL_BACKEND",
            "Write a Custom Data App Backend — HR Offboarding (Spring Boot/Hephaestus)",
            "A background job for your custom data app — here, HR offboarding that disables the logins of employees who have left. Feel free to swap in whatever recurring job your own app needs.",
            List.of("custom-app", "hr-portal", "backend", "hephaestus"),
            "Seed Data / Apps",
            """
Hephaestus — I've got my **HR payslips portal** (Larkspur Media Ltd) and I need a **daily background job**
for it: any employee whose **end date** has passed should have their portal login switched off, so people
who've left can't sign in any more. Keep their payslips on file — just disable the login.

(Delivering the payslips isn't this job — DataPallas already generates and emails them. This is only the
offboarding cleanup.)

Use your existing **building-custom-apps** skill."""
        );
    }
}
