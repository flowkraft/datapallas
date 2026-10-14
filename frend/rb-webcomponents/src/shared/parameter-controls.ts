// Which control a declared parameter type is filled in with, and what it starts empty as.
//
// The type comes from the dashboard's Report-Parameters DSL and travels, unchanged, to the backend,
// which binds the value as that type (ParameterTypes, in bkend/common). So the two have to know the
// same type names: a parameter declared `double` that fell through to a text box here was the same
// parameter whose value the database then had to guess at.
//
// It is also the one place the two naming styles meet: the DSL author writes kebab-case
// (`multi-select`), the Canvas filter dialog writes its dropdown's own words (`multiselect`,
// `datepicker`, `checkbox`), and both have to draw the same control. One alias table, so they can
// never drift apart again.
//
// Plain functions in a module of their own, so `npm test` can ask them directly — a .svelte file's
// internals are reachable only through a browser.
//
//   npm test        (inside frend/rb-webcomponents)

/** A parameter as the DSL declares it, as far as the control is concerned. */
export interface ParameterControlMeta {
  /** The parameter's own id — used only to name it in the warning below. */
  id?: string;
  type?: string;
  uiHints?: { control?: string; widget?: string } | null;
}

/** The names the filter bar draws a control for. Anything else is a text box. */
export const KNOWN_CONTROLS: readonly string[] = [
  'text', 'date', 'datetime', 'integer', 'decimal', 'boolean', 'select', 'multi-select', 'radio',
  // Two Date parameters, `<id>From` and `<id>To`, drawn as one range (`date-range.ts`).
  'date-range',
];

/** The dialog's words, and the DSL's older ones, in the names the template branches on. */
const CONTROL_ALIASES: Readonly<Record<string, string>> = {
  multiselect: 'multi-select',
  datepicker: 'date',
  daterange: 'date-range',
  // `double` is the name the backend conversion knows for a number with a fraction; without this
  // line a parameter declared that way fell through to a text box.
  double: 'decimal',
  number: 'decimal',
  // The dialog's "checkbox" is the tick box a Boolean parameter gets on "auto".
  checkbox: 'boolean',
  bool: 'boolean',
};

/** One warning per parameter per unknown control — the template asks on every render. */
const warned = new Set<string>();

/**
 * The control this parameter is filled in with: an explicit `control:` or `widget:` ui hint wins,
 * then the declared type, then a text box.
 *
 * A ui hint naming a control the filter bar cannot draw still falls back to a text box — the reader
 * can always type the value — but it says so once in the console, naming the parameter and the
 * control, instead of failing silently the way "radio" used to.
 */
export function controlTypeOf(p: ParameterControlMeta): string {
  const hint = (p.uiHints?.control || p.uiHints?.widget || '').toLowerCase();
  const raw = (hint || p.type || 'text').toLowerCase();
  const control = CONTROL_ALIASES[raw] ?? raw;
  if (hint && !KNOWN_CONTROLS.includes(control)) {
    const key = `${p.id ?? ''}\u0000${hint}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `rb-parameters: parameter "${p.id ?? '(unnamed)'}" asks for the control "${hint}", `
        + `which is not one of ${KNOWN_CONTROLS.join(', ')} — showing a text box instead.`,
      );
    }
  }
  return control;
}

/** Forgets which unknown controls were warned about. For the tests. */
export function resetControlWarnings(): void {
  warned.clear();
}

/**
 * Whether a Boolean parameter's tick box is ticked. A published dashboard's defaults reach the page as text
 * (the server keeps every default as a string), and so does a value read from a link: the text "false" is a
 * value, so testing the value itself ticked every Boolean whose default was false. Only true, or the word
 * true in any case, ticks the box.
 */
export function isTicked(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

/** What a parameter holds before anyone fills it in: false for a tick box, nothing for a number. */
export function defaultForType(type: string): any {
  const t = (type || '').toLowerCase();
  if (t === 'boolean') return false;
  if (t === 'integer' || t === 'decimal' || t === 'double') return null;
  return '';
}

/**
 * The value a drop-down is set to, and the value each of its options carries: always text.
 *
 * A browser picks the option whose value equals the select's own value, and equal there means the
 * same type. An Integer parameter holds a number (DD05's Top N opens on 10) or nothing (DD13's and
 * DD14's "-- All --"), while options come from SQL or from the declaration as text - so the drop-down
 * matched none of them and opened blank. Both sides as text, with nothing as the empty option.
 */
export function selectValueOf(value: unknown): string {
  return value == null ? '' : String(value);
}
