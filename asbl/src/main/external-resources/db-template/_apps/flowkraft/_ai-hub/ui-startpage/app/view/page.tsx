"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useMyDashboards } from "@/lib/hooks/use-my-dashboards";

/**
 * A dashboard viewer's home: one published dashboard, and the URL says which.
 *
 * <p>Nothing is decided here about WHICH dashboards exist — the backend answers that per person, and
 * the middleware has already refused anyone who has no business on this page. What this page owns is
 * the choice between them: `?d=<reportId>` when it names one the person may open, the default the
 * backend resolved from their groups otherwise, and the first of the list when there is no default.
 *
 * <p>The id lives in the query string on purpose. It survives a reload and can be bookmarked or
 * mailed to a colleague, who will see it if they may and be sent back to their own default if they
 * may not — the backend refusing the data is what makes that safe, not this page.
 */
export default function ViewDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <ViewDashboard />
    </Suspense>
  );
}

function ViewDashboard() {
  const searchParams = useSearchParams();
  const { dashboards, defaultDashboard, resolved } = useMyDashboards();

  if (!resolved) return <DashboardLoading />;

  if (dashboards.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div id="viewNoDashboards" className="text-base-content/70">
          No dashboards have been shared with you yet. Ask your administrator.
        </div>
      </div>
    );
  }

  // An unknown or ungranted ?d is not an error worth a screen of its own: it is a stale link, and the
  // person's own default is a better answer to it than a refusal they cannot act on.
  const asked = searchParams.get("d");
  const granted = dashboards.some((dashboard) => dashboard.id === asked);
  const current = (granted && asked) || defaultDashboard || dashboards[0].id;
  const currentName = dashboards.find((dashboard) => dashboard.id === current)?.name ?? current;

  return (
    <div className="max-w-full mx-auto px-6 py-6">
      <h1 id="view-page-heading" className="text-2xl font-bold text-base-content mb-4">
        {currentName}
      </h1>

      {/*
        The same element, the same proxy base url and the same empty api key the canvas widgets use:
        the calls it makes carry this person's own session, so the backend authorises them as them.
        Keyed by the report id so that switching dashboards remounts the component rather than asking
        it to swap its report underneath itself.
      */}
      {/* @ts-expect-error - Web component custom element */}
      <rb-dashboard key={current} report-id={current} api-base-url="/api/dp" api-key="" />
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <span className="loading loading-spinner loading-lg" />
    </div>
  );
}
