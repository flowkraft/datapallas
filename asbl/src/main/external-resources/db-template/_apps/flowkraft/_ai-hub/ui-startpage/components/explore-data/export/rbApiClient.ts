/**
 * Saves a canvas as a DataPallas dashboard report.
 *
 * No request body is sent.  The Java backend reads everything it needs
 * (name, connectionId, widgets, filterDsl, exportedReportCode) from the
 * SQLite DB that the client auto-saves to, and derives the dashboard slug
 * server-side.  The response carries the slug the server chose so the client
 * can update its exportedReportCode.
 */

// Same-origin proxy — see app/api/dp/[...path]/route.ts.
const RB_BASE = "/api/dp";

interface SaveResult {
  success: boolean;
  reportId: string;
  dashboardUrl: string;
  error?: string;
  /** Widget ID blamed when the Groovy compile check fails (HTTP 422). */
  widgetId?: string;
}

export async function saveDashboardToDataPallas(canvasId: string): Promise<SaveResult> {
  try {
    const res = await fetch(
      `${RB_BASE}/explorations/${encodeURIComponent(canvasId)}/export`,
      { method: "POST" },
    );

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const reportId    = (data.reportId    as string) || "";
    const dashboardUrl = (data.dashboardUrl as string) ||
      `${RB_BASE.replace("/api", "")}/dashboard/${reportId}`;

    if (!res.ok || !data.success) {
      return {
        success: false, reportId, dashboardUrl,
        error:    (data.error as string) || `Export failed (HTTP ${res.status})`,
        widgetId: data.widgetId as string | undefined,
      };
    }

    return { success: true, reportId, dashboardUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, reportId: "", dashboardUrl: "", error: message };
  }
}
