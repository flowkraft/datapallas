"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { useMyDashboards } from "@/lib/hooks/use-my-dashboards"

/**
 * The dashboard viewer's only navigation: which of their dashboards is on screen.
 *
 * <p>It is a plain select rather than a menu of links because that is what it is — one value, the
 * current one shown, the others available — and because the list is as long as an administrator has
 * made it. Hidden when there is nothing to choose: a picker with one entry, or none, only takes up
 * room next to the person's own name.
 *
 * <p>The list comes from the same hook the page reads, so the two cannot offer different dashboards,
 * and choosing one changes the URL rather than any state here — the page owns what is displayed.
 */
export function DashboardSwitcher() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { dashboards, defaultDashboard, resolved } = useMyDashboards()

  if (!resolved || dashboards.length === 0) return null

  const asked = searchParams.get("d")
  const granted = dashboards.some((dashboard) => dashboard.id === asked)
  const current = (granted && asked) || defaultDashboard || dashboards[0].id

  return (
    <select
      id="dashboardSwitcher"
      className="select select-bordered select-sm max-w-48"
      aria-label="Dashboard"
      value={current}
      onChange={(event) => router.push(`/view?d=${encodeURIComponent(event.target.value)}`)}
    >
      {dashboards.map((dashboard) => (
        <option key={dashboard.id} value={dashboard.id}>
          {dashboard.name}
        </option>
      ))}
    </select>
  )
}
