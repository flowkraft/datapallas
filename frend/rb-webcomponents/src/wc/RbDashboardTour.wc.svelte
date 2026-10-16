<svelte:options customElement={{ tag: "rb-dashboard-tour", shadow: "none" }} />

<!--
  rb-dashboard-tour — the "Show Tour" button of a dashboard: one button above the whole page that
  starts a guided walk through what the dashboard can do (see shared/dashboard-tour.ts).

  Use, anywhere inside the dashboard (the page's bar is the place):
    <rb-dashboard-tour></rb-dashboard-tour>
    <rb-dashboard-tour label="Take the tour"></rb-dashboard-tour>

  The dashboard is the nearest `.rb-dashboard-root` above the button. The tour is optional: nobody has
  to press it, and a dashboard without the element has no tour.
-->

<script lang="ts">
  import { dashboardTourSteps } from '../shared/dashboard-tour';
  import type { TourStep } from '../shared/tour';

  export let label: string = 'Show Tour';

  let button: HTMLButtonElement;
  let open = false;

  async function startTour() {
    if (open || !button) return;
    open = true;
    const root: ParentNode = button.closest('.rb-dashboard-root') ?? document.body;
    // The explorer hands over its own steps: its first story, from the question to the answer.
    const cube = root.querySelector('rb-cube-renderer') as
      | (Element & { tourSteps?: () => TourStep[]; tourReady?: () => boolean; resetForTour?: () => Promise<void>; tourClose?: () => void })
      | null;
    // A reader who presses the button the moment the page opens is ahead of the cube: its stories are
    // still being read, and a tour made now would skip the whole explorer. Give it a moment.
    for (let waited = 0; cube?.tourReady && !cube.tourReady() && waited < 5000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // A tour starts from scratch: the explorer is put back to how it was published, whatever was clicked before.
    await cube?.resetForTour?.();
    const cubeSteps = cube?.tourSteps?.() ?? [];
    if (cube && cubeSteps.length === 0) console.warn('rb-dashboard-tour: the explorer gave no steps (no stories yet, or it is read-only)');
    const tour: any = document.createElement('rb-tour');
    tour.steps = dashboardTourSteps({ root, cubeSteps });
    tour.autostart = true;
    tour.addEventListener('tourend', () => {
      cube?.tourClose?.();
      open = false;
      tour.remove();
    });
    document.body.append(tour);
  }
</script>

<button bind:this={button} type="button" id="btnShowTour" class="rbdt-btn" disabled={open} on:click={startTour}
        title="A short guided tour of what this dashboard can do">
  <svg class="rbdt-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M10 7.5v9l7-4.5z" /></svg>
  {label}
</button>

<style>
  /*
   * Made to be found: a warm amber against the page's cool accent, with a soft ring that breathes
   * until the reader has seen it (it stops on hover, and for readers who ask for less motion).
   * Amber with dark text reads on a light page and on a dark one.
   */
  .rbdt-btn {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 10px 22px 10px 16px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #fcd34d, #f59e0b);
    color: #2b1a00;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
    animation: rbdt-ring 2.6s ease-out infinite;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .rbdt-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(245, 158, 11, 0.55);
    animation: none;
  }
  .rbdt-btn:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
  }
  .rbdt-btn:disabled {
    cursor: default;
    opacity: 0.55;
    animation: none;
  }
  .rbdt-icon {
    width: 20px;
    height: 20px;
    flex: none;
  }
  .rbdt-icon circle {
    fill: #2b1a00;
  }
  .rbdt-icon path {
    fill: #fcd34d;
  }
  @keyframes rbdt-ring {
    0% { box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35), 0 0 0 0 rgba(245, 158, 11, 0.55); }
    70%, 100% { box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35), 0 0 0 12px rgba(245, 158, 11, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rbdt-btn {
      animation: none;
      transition: none;
    }
  }
</style>
