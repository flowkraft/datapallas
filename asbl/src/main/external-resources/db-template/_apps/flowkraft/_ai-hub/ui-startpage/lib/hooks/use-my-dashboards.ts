"use client";

import { useEffect, useState } from "react";

/** One dashboard the signed-in person may open: the report id, and what it is called. */
export type MyDashboard = { id: string; name: string };

export type MyDashboards = {
  dashboards: MyDashboard[];
  /** Where to land when the URL does not say, or null: an empty list, or any role but a viewer. */
  defaultDashboard: string | null;
  /** False until the first answer arrives, so nothing renders an empty state it does not know yet. */
  resolved: boolean;
};

/**
 * What `GET /api/dp/me/dashboards` answers, for whoever asks.
 *
 * <p>The list is the backend's decision and nothing here second-guesses it: a dashboard viewer is
 * answered with the union of their groups' grants, sorted by name, and everybody else with the whole
 * catalogue. The viewer page and the navbar's switcher both render from this one hook so that the
 * page and the list of pages can never show different dashboards.
 *
 * <p>A failed call leaves the list empty and `resolved` true — the page then says that nothing has
 * been shared, which is the same thing a viewer with no grants sees, and is the honest reading of
 * "the backend did not name a dashboard you may open".
 */
export function useMyDashboards(): MyDashboards {
  const [state, setState] = useState<MyDashboards>({
    dashboards: [],
    defaultDashboard: null,
    resolved: false,
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/dp/me/dashboards", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return;
        setState({
          dashboards: body?.dashboards ?? [],
          defaultDashboard: body?.defaultDashboard ?? null,
          resolved: true,
        });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, resolved: true }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
