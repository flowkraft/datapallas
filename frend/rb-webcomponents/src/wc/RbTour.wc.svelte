<svelte:options customElement={{ tag: "rb-tour", shadow: "none" }} />

<!--
  rb-tour — a guided tour: a lit box over the part of the page a step is about, and a card beside it
  with the words. Pure DOM/CSS, no library.

  Use:
    const tour = document.createElement('rb-tour');
    tour.steps = [{ target: '#save', title: 'Save', content: 'Press **Save** to keep it.' }, ...];
    tour.autostart = true;                  // starts as soon as it is on the page
    tour.addEventListener('tourend', (e) => console.log(e.detail.finished));
    document.body.append(tour);             // it removes nothing: the caller removes it on 'tourend'

  A step is `{ target?, title?, content, before?, optional? }` (see shared/tour.ts). The tour is
  drawn `position: fixed` over the whole page and takes its clicks while it is open: the reader
  watches, and moves with Next / Back / the arrow keys; Esc or ✕ ends it where it stands.
-->

<script lang="ts">
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { toBox, unionBox, clampBox, spotlightBox, placeDialog, richText, intersectBox, dimPath, mergeNear } from '../shared/tour';
  import { celebrateSvg } from '../shared/tour-art';
  import type { Box, Placement, TourStep, TourTarget } from '../shared/tour';

  export let steps: TourStep[] = [];
  /** Start as soon as the element is on the page, so a caller needs no timing of its own. */
  export let autostart: boolean = false;
  /** Air, in px, between the lit box and the target. */
  export let padding: number = 8;
  /** How long a step waits for its target to be on the page before it is skipped or shown anyway, in ms. */
  export let waitMs: number = 3000;

  const dispatch = createEventDispatcher();
  const OPTIONAL_WAIT_MS = 500;

  let open = false;
  let index = 0;
  /** Puts back what the shown step changed on the page (its `during`). */
  let undo: (() => void) | null = null;
  function leave() {
    const put = undo;
    undo = null;
    try { put?.(); } catch (e) { console.warn('[RbTour] a step\'s undo failed', e); }
  }
  let title = '';
  let html = '';
  let art: TourStep['art'];
  let hasTarget = false;
  let spot: Box = { left: 0, top: 0, width: 0, height: 0 };
  /** The lit boxes of a step that lights each target by itself (`each`); empty for one box round everything. */
  let holes: Box[] = [];
  let screen = { width: 0, height: 0 };
  let place: Placement = { side: 'center', left: 0, top: 0, arrow: -1 };
  let dialogEl: HTMLDivElement;
  let nextEl: HTMLButtonElement;
  /** Bumped by every move of the tour, so a step that was waiting when the reader moved on stops. */
  let run = 0;
  let resizeObserver: ResizeObserver | undefined;
  let frame = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** Whether Next is Finish: nothing is left after this step that could still be shown. */
  let isLast = false;

  /** The elements a step points at, found again each time: a table drawn again is a new element. */
  function targetsOf(step: TourStep | undefined): Element[] {
    const spec: TourTarget | undefined = step?.target;
    if (!spec) return [];
    const given = typeof spec === 'function' ? spec() : spec;
    if (!given) return [];
    const list = Array.isArray(given) ? given : [given];
    const found: Element[] = [];
    for (const one of list) {
      if (typeof one === 'string') {
        const el = document.querySelector(one);
        if (el) found.push(el);
      } else if (one) {
        found.push(one);
      }
    }
    return found;
  }

  function frames(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  /** The target is waited for, but not for ever: a card pointing at nothing is worse than a late one. */
  async function waitForTargets(step: TourStep, mine: number): Promise<Element[]> {
    const started = Date.now();
    // A step that may be left out is not worth a long wait: the reader is waiting on it.
    const limit = step.optional ? Math.min(waitMs, OPTIONAL_WAIT_MS) : waitMs;
    for (;;) {
      const found = targetsOf(step);
      if (found.length > 0 || mine !== run || Date.now() - started >= limit) return found;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }

  /**
   * Bring the target into the screen - and into view inside any panel that scrolls on its own. One that
   * fits is centred; one taller than the screen is lined up by its top, because its start is the part a
   * reader needs (centred, its top and bottom would both be cut off).
   */
  function bringIntoView(targets: Element[], anchor?: Element | null) {
    if (anchor) {
      const taller = anchor.getBoundingClientRect().height > view().height * 0.92;
      anchor.scrollIntoView({ block: taller ? 'start' : 'center', inline: 'nearest' });
      // A little air above it when it is lined up by its top, so its first row is not on the very edge.
      if (taller) window.scrollBy(0, -16);
      return;
    }
    const box = unionBox(targets.map((el) => toBox(el.getBoundingClientRect())));
    const tall = !!box && box.height > view().height * 0.85;
    targets[0].scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest' });
  }

  function view() {
    const root = document.documentElement;
    return { width: root.clientWidth, height: window.innerHeight };
  }

  /** The part of an element that can be seen: cut by the screen and by every panel that scrolls on its own. */
  function visibleBox(el: Element): Box {
    let box = toBox(el.getBoundingClientRect());
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const css = getComputedStyle(p);
      if (css.overflowX !== 'visible' || css.overflowY !== 'visible') box = intersectBox(box, toBox(p.getBoundingClientRect()));
    }
    return clampBox(box, view());
  }

  /** Measure the target and draw the lit box and the card beside it, where they are right now. */
  async function layout() {
    const step = steps[index];
    if (!open || !step) return;
    const size = view();
    screen = size;
    let visible: Box | null;
    if (step.each) {
      // Each target is lit by itself, so what is between them stays dark; one scrolled out of its panel is left out.
      const seen = targetsOf(step).map(visibleBox).filter((b) => b.width > 2 && b.height > 2);
      holes = mergeNear(seen, 6).map((b) => spotlightBox(b, Math.max(2, padding / 2), size));
      visible = unionBox(holes);
      hasTarget = !!visible;
      spot = visible ?? { left: 0, top: 0, width: 0, height: 0 };
    } else {
      holes = [];
      const box = unionBox(targetsOf(step).map((el) => toBox(el.getBoundingClientRect())));
      visible = box ? clampBox(box, size) : null;
      hasTarget = !!visible && visible.width > 0 && visible.height > 0;
      spot = hasTarget ? spotlightBox(box!, padding, size) : { left: 0, top: 0, width: 0, height: 0 };
    }
    await tick();
    if (!dialogEl) return;
    place = placeDialog(hasTarget ? visible : null, { width: dialogEl.offsetWidth, height: dialogEl.offsetHeight }, size);
  }

  /** The page moved (a scroll, in the window or inside a panel; a resize; a target that changed size). */
  function relayout() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; layout(); });
  }

  /**
   * Show the step at `at`, going `direction` (+1 forward, -1 back), over any that are optional and
   * have nothing to point at. Past the last step the tour is finished.
   */
  async function show(at: number, direction: 1 | -1) {
    const mine = ++run;
    leave();
    let i = at;
    while (i >= 0 && i < steps.length) {
      const step = steps[i];
      // An action of the step is done once, on the way forward: Back shows what is already there.
      if (direction > 0 && step.before) {
        try { await step.before(); } catch (e) { console.warn('[RbTour] a step\'s before() failed', e); }
        if (mine !== run) return;
      }
      // What the step changes on the page while it is shown, on the way forward and on Back alike; put back when it is left.
      if (step.during) {
        try { const put = step.during(); if (typeof put === 'function') undo = put; } catch (e) { console.warn('[RbTour] a step\'s during() failed', e); }
        await tick();
      }
      let targets: Element[] = [];
      if (step.target) {
        targets = await waitForTargets(step, mine);
        if (mine !== run) return;
        if (targets.length === 0 && step.optional) { leave(); i += direction; continue; }
      }
      index = i;
      isLast = steps.slice(i + 1).every((later) => later.optional && targetsOf(later).length === 0);
      title = step.title ?? '';
      html = richText(step.content);
      art = step.art;
      await tick();
      resizeObserver?.disconnect();
      if (targets.length > 0) {
        bringIntoView(targets, step.focus?.());
        targets.forEach((el) => resizeObserver?.observe(el));
      }
      await frames();
      if (mine !== run) return;
      await layout();
      nextEl?.focus({ preventScroll: true });
      // What arrives a moment later (a table, a chart) moves the target: look once more.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(relayout, 450);
      return;
    }
    if (i >= steps.length) finish(true);
    // Back past the first step stays on it.
  }

  /** Open the tour at its first step. */
  export function start() {
    if (open || steps.length === 0) return;
    open = true;
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', relayout);
    // Capture: a scroll inside a panel does not bubble to the window, and it moves the target all the same.
    window.addEventListener('scroll', relayout, true);
    resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(relayout);
    show(0, 1);
  }

  /** Close the tour where it stands. `finished` is whether the reader went through to the end. */
  export function stop(finished: boolean = false) { finish(finished); }

  function finish(finished: boolean) {
    if (!open) return;
    run++;
    open = false;
    leave();
    cleanup();
    dispatch('tourend', { finished, step: index });
  }

  function cleanup() {
    leave();
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', relayout);
    window.removeEventListener('scroll', relayout, true);
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(settleTimer);
  }

  function next() { show(index + 1, 1); }
  function back() { if (index > 0) show(index - 1, -1); }

  function onKeydown(event: KeyboardEvent) {
    if (!open) return;
    const handled = event.key === 'Escape' || event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    if (!handled) return;
    // The page behind a tour must not hear the keys the tour is using.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') finish(false);
    else if (event.key === 'ArrowRight') next();
    else back();
  }

  onMount(() => {
    if (autostart && steps.length > 0) start();
  });
  onDestroy(cleanup);
</script>

{#if open}
  <!-- Takes the page's clicks while the tour is open: the reader watches, and moves with the buttons. -->
  <div class="rb-tour-shield" aria-hidden="true"></div>
  {#if hasTarget && holes.length > 0}
    <svg class="rb-tour-mask" width={screen.width} height={screen.height} aria-hidden="true"><path fill-rule="evenodd" d={dimPath(screen, holes)} /></svg>
    {#each holes as hole}
      <div class="rb-tour-hole" style="left: {hole.left}px; top: {hole.top}px; width: {hole.width}px; height: {hole.height}px;"></div>
    {/each}
  {:else if hasTarget}
    <div class="rb-tour-spot" style="left: {spot.left}px; top: {spot.top}px; width: {spot.width}px; height: {spot.height}px;"></div>
  {:else}
    <div class="rb-tour-dim"></div>
  {/if}
  <div bind:this={dialogEl} class="rb-tour-card rb-tour-{place.side}" role="dialog" aria-modal="true"
       aria-label={title || 'Guided tour'} style="left: {place.left}px; top: {place.top}px;">
    {#if place.arrow >= 0}
      <span class="rb-tour-arrow"
            style={place.side === 'top' || place.side === 'bottom' ? `left: ${place.arrow}px;` : `top: ${place.arrow}px;`}></span>
    {/if}
    <div class="rb-tour-head">
      <div class="rb-tour-title">{title}</div>
      <button type="button" class="rb-tour-close" aria-label="Close the tour" title="Close (Esc)"
              on:click={() => finish(false)}>×</button>
    </div>
    <!-- richText escapes everything and turns only **word** into <strong>, so no markup can come in. -->
    <div class="rb-tour-body">{@html html}</div>
    {#if art === 'celebrate'}
      <!-- Drawn again each time the step is reached, so the picture plays from its start. Fixed markup, no user text. -->
      {#key index}<div class="rb-tour-art" aria-hidden="true">{@html celebrateSvg()}</div>{/key}
    {/if}
    <div class="rb-tour-foot">
      <button type="button" class="rb-tour-btn" disabled={index === 0} on:click={back}>Back</button>
      <span class="rb-tour-progress">{index + 1}/{steps.length}</span>
      <button type="button" bind:this={nextEl} class="rb-tour-btn rb-tour-primary" on:click={next}>{isLast ? 'Finish' : 'Next'}</button>
    </div>
  </div>
{/if}

<style>
  .rb-tour-shield {
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: transparent;
  }
  /* The lit box: nothing of its own, but a shadow so wide that it darkens the rest of the screen. */
  .rb-tour-spot {
    position: fixed;
    z-index: 100001;
    border-radius: 8px;
    pointer-events: none;
    box-shadow: 0 0 0 100vmax rgba(8, 10, 16, 0.68);
    outline: 2px solid var(--rb-accent, var(--color-primary, #5b8def));
    transition: left 0.25s, top 0.25s, width 0.25s, height 0.25s;
  }
  /* Several lit boxes: one dimmed sheet with a hole at each, and a ring round each hole. */
  .rb-tour-mask {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 100001;
    pointer-events: none;
  }
  .rb-tour-mask path {
    fill: rgba(8, 10, 16, 0.68);
  }
  .rb-tour-hole {
    position: fixed;
    z-index: 100001;
    border-radius: 6px;
    pointer-events: none;
    outline: 2px solid var(--rb-accent, var(--color-primary, #5b8def));
  }
  .rb-tour-dim {
    position: fixed;
    inset: 0;
    z-index: 100001;
    pointer-events: none;
    background: rgba(8, 10, 16, 0.68);
  }
  .rb-tour-card {
    position: fixed;
    z-index: 100002;
    box-sizing: border-box;
    width: max-content;
    max-width: min(340px, calc(100vw - 24px));
    padding: 16px 18px 14px;
    border-radius: 12px;
    background: var(--color-base-100, #fff);
    color: var(--color-base-content, #1f2430);
    border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    transition: left 0.25s, top 0.25s;
  }
  .rb-tour-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .rb-tour-title {
    flex: 1;
    font-size: 15px;
    font-weight: 700;
  }
  .rb-tour-close {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 0 2px;
  }
  .rb-tour-close:hover {
    opacity: 1;
  }
  .rb-tour-body {
    margin: 8px 0 14px;
  }
  .rb-tour-foot {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rb-tour-progress {
    flex: 1;
    text-align: center;
    font-size: 12px;
    opacity: 0.65;
  }
  .rb-tour-btn {
    font: inherit;
    font-size: 13px;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    color: inherit;
    background: none;
    border: 1px solid color-mix(in oklab, currentColor 28%, transparent);
  }
  .rb-tour-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .rb-tour-primary {
    background: var(--rb-accent, var(--color-primary, #2f6fd6));
    color: var(--rb-accent-text, var(--color-primary-content, #fff));
    border-color: transparent;
  }
  /* The pointer: a square turned 45 degrees, half of it hidden behind the card's own edge. */
  .rb-tour-arrow {
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--color-base-100, #fff);
    transform: translate(-50%, -50%) rotate(45deg);
  }
  .rb-tour-bottom .rb-tour-arrow {
    top: 0;
    border-left: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    border-top: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  }
  .rb-tour-top .rb-tour-arrow {
    top: 100%;
    border-right: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    border-bottom: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  }
  .rb-tour-right .rb-tour-arrow {
    left: 0;
    border-left: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    border-bottom: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  }
  .rb-tour-left .rb-tour-arrow {
    left: 100%;
    border-right: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    border-top: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .rb-tour-spot,
    .rb-tour-card {
      transition: none;
    }
  }

  /*
   * The picture at the end (shared/tour-art.ts). Its markup comes in as HTML, so Svelte cannot see
   * it and every rule here is :global. What an element looks like with no animation is its FINISHED
   * state, and each animation only says where it starts: a reader who asks for less motion gets the
   * finished picture, still, and the confetti - which is only ever in motion - is not drawn.
   */
  .rb-tour-art {
    margin: 0 0 12px;
    pointer-events: none;
  }
  .rb-tour-art :global(.rbta) {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  /*
   * Leo's scene runs on one clock, in seconds:
   *   0 - 1.6   puzzled: swaying, question marks, a sweat drop
   *   1.6 - 2.8 thinking: the light bulb flickers on
   *   2.8 -     got it: the jump (3.05 s at the top), "Got it!", the chart builds, confetti at 3.2 s
   * (the delays in tour-art.ts for the confetti and the sparkles follow it).
   */
  .rb-tour-art :global(.rbta-glow) {
    fill: var(--rb-accent, var(--color-primary, #5b8def));
    opacity: 0.14;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-glow 2.4s ease-in-out infinite;
  }
  .rb-tour-art :global(.rbta-floor) {
    fill: #000;
    opacity: 0.22;
  }
  .rb-tour-art :global(.rbta-board) {
    fill: color-mix(in oklab, currentColor 5%, transparent);
    stroke: currentColor;
    stroke-opacity: 0.22;
    stroke-width: 1.5;
  }
  .rb-tour-art :global(.rbta-label) {
    fill: currentColor;
    opacity: 0.22;
  }
  .rb-tour-art :global(.rbta-base) {
    stroke: currentColor;
    stroke-opacity: 0.28;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .rb-tour-art :global(.rbta-bar) {
    fill: var(--rb-accent, var(--color-primary, #5b8def));
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: rbta-grow 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(3s + var(--i) * 100ms);
  }
  .rb-tour-art :global(.rbta-line) {
    fill: none;
    stroke: #f5b942;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    animation: rbta-draw 0.8s ease-out 3.5s both;
  }
  .rb-tour-art :global(.rbta-dot) {
    fill: #f5b942;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) 4.2s both;
  }

  /* Leo. `.rbta-leo` plays the story once, `.rbta-bob` then keeps him bouncing; both turn about his feet. */
  .rb-tour-art :global(.rbta-leo),
  .rb-tour-art :global(.rbta-bob) {
    transform-origin: 90px 202px;
  }
  .rb-tour-art :global(.rbta-leo) {
    animation: rbta-leo 3.9s ease-in-out both;
  }
  .rb-tour-art :global(.rbta-bob) {
    animation: rbta-bob 0.9s ease-in-out 4s infinite;
  }
  /* Three poses on top of each other; the last frame is "got it", so that is the one with no animation. */
  .rb-tour-art :global(.rbta-pose) {
    opacity: 0;
  }
  .rb-tour-art :global(.rbta-pose-confused) {
    animation: rbta-pose-confused 1.6s steps(1, end) forwards;
  }
  .rb-tour-art :global(.rbta-pose-thinking) {
    animation: rbta-pose-thinking 2.8s steps(1, end) forwards;
  }
  .rb-tour-art :global(.rbta-pose-excited) {
    opacity: 1;
    animation: rbta-pose-excited 2.8s steps(1, end) both;
  }

  /* What comes out of his head. Each is hidden at rest, so with no animation none of it is drawn. */
  .rb-tour-art :global(.rbta-q) {
    fill: var(--rb-accent, var(--color-primary, #5b8def));
    font: 800 22px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-q 1.15s ease-out forwards;
  }
  .rb-tour-art :global(.rbta-sweat) {
    fill: #60a5fa;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-drip 1.2s ease-in 0.3s forwards;
  }
  .rb-tour-art :global(.rbta-glass) {
    fill: #fde047;
    stroke: #ca8a04;
    stroke-width: 1.5;
    animation: rbta-flicker 0.9s linear 1.9s both;
  }
  .rb-tour-art :global(.rbta-cap) {
    fill: #9ca3af;
  }
  .rb-tour-art :global(.rbta-rays) {
    fill: none;
    stroke: #f5b942;
    stroke-width: 2.4;
    stroke-linecap: round;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-pop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) 2.8s both;
  }
  .rb-tour-art :global(.rbta-bubble) {
    transform-box: fill-box;
    transform-origin: 20% 100%;
    animation: rbta-pop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) 3.1s both;
  }
  .rb-tour-art :global(.rbta-bubble path) {
    fill: var(--color-base-100, #fff);
    stroke: var(--rb-accent, var(--color-primary, #5b8def));
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .rb-tour-art :global(.rbta-bubble text) {
    fill: var(--color-base-content, #1f2430);
    font: 800 16px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .rb-tour-art :global(.rbta-confetti) {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-burst 1.6s cubic-bezier(0.15, 0.7, 0.4, 1) both;
  }
  .rb-tour-art :global(.rbta-sparkle) {
    fill: #fde68a;
    opacity: 0.9;
    transform-box: fill-box;
    transform-origin: center;
    animation: rbta-twinkle 1.6s ease-in-out infinite backwards;
  }
  @keyframes -global-rbta-glow {
    50% { transform: scale(1.08); opacity: 0.22; }
  }
  @keyframes -global-rbta-grow {
    from { transform: scaleY(0); }
  }
  @keyframes -global-rbta-draw {
    from { stroke-dashoffset: 1; }
  }
  @keyframes -global-rbta-pop {
    from { transform: scale(0); }
  }
  @keyframes -global-rbta-leo {
    0% { transform: rotate(0deg); }
    10% { transform: rotate(-3deg); }
    20% { transform: rotate(3deg); }
    30% { transform: rotate(-3deg); }
    41% { transform: rotate(0deg); }
    52%, 70% { transform: rotate(2deg); }
    72% { transform: rotate(0deg) scale(1.06, 0.92); }
    78% { transform: translateY(-18px) scale(0.97, 1.05); }
    87% { transform: scale(1.05, 0.94); }
    93% { transform: scale(0.98, 1.02); }
    100% { transform: none; }
  }
  @keyframes -global-rbta-bob {
    50% { transform: translateY(-4px); }
  }
  @keyframes -global-rbta-pose-confused {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes -global-rbta-pose-thinking {
    0% { opacity: 0; }
    57.14% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes -global-rbta-pose-excited {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes -global-rbta-q {
    0% { opacity: 0; transform: translateY(8px) scale(0.3); }
    25% { opacity: 1; transform: translateY(0) scale(1.2); }
    70% { opacity: 1; transform: translateY(-5px) scale(1); }
    100% { opacity: 0; transform: translateY(-12px) scale(1); }
  }
  @keyframes -global-rbta-drip {
    0% { opacity: 0; transform: translateY(0); }
    15% { opacity: 1; }
    100% { opacity: 0; transform: translateY(22px); }
  }
  @keyframes -global-rbta-flicker {
    0% { opacity: 0.1; }
    15% { opacity: 0.9; }
    30% { opacity: 0.15; }
    45% { opacity: 1; }
    60% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  @keyframes -global-rbta-burst {
    0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; }
    35% { transform: translate(var(--dx), var(--dy)) scale(1) rotate(calc(var(--r) * 0.4)); opacity: 1; }
    100% { transform: translate(calc(var(--dx) * 1.2), calc(var(--dy) + 70px)) scale(0.9) rotate(var(--r)); opacity: 0; }
  }
  @keyframes -global-rbta-twinkle {
    0%, 100% { transform: scale(0.35); opacity: 0; }
    50% { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rb-tour-art :global(.rbta-glow),
    .rb-tour-art :global(.rbta-bar),
    .rb-tour-art :global(.rbta-line),
    .rb-tour-art :global(.rbta-dot),
    .rb-tour-art :global(.rbta-leo),
    .rb-tour-art :global(.rbta-bob),
    .rb-tour-art :global(.rbta-pose),
    .rb-tour-art :global(.rbta-q),
    .rb-tour-art :global(.rbta-sweat),
    .rb-tour-art :global(.rbta-glass),
    .rb-tour-art :global(.rbta-rays),
    .rb-tour-art :global(.rbta-bubble),
    .rb-tour-art :global(.rbta-confetti),
    .rb-tour-art :global(.rbta-sparkle) {
      animation: none;
    }
  }
</style>
