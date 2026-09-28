// Which control a declared parameter type is filled in with, and what it starts empty as.
//
// The type comes from the dashboard's Report-Parameters DSL and travels, unchanged, to the backend,
// which binds the value as that type (ParameterTypes, in bkend/common). So the two have to know the
// same type names: a parameter declared `double` that fell through to a text box here was the same
// parameter whose value the database then had to guess at.
//
// Plain functions in a module of their own, so `npm test` can ask them directly — a .svelte file's
// internals are reachable only through a browser.
//
//   npm test        (inside frend/rb-webcomponents)

/** A parameter as the DSL declares it, as far as the control is concerned. */
export interface ParameterControlMeta {
  type?: string;
  uiHints?: { control?: string; widget?: string } | null;
}

/**
 * The control this parameter is filled in with: an explicit `control:` or `widget:` ui hint wins,
 * then the declared type, then a text box.
 */
export function controlTypeOf(p: ParameterControlMeta): string {
  const raw = (p.uiHints?.control || p.uiHints?.widget || p.type || 'text').toLowerCase();
  if (raw === 'multiselect') return 'multi-select';
  if (raw === 'datepicker') return 'date';
  // `double` is the name the backend conversion knows for a number with a fraction; without this
  // line a parameter declared that way fell through to a text box.
  if (raw === 'double') return 'decimal';
  return raw;
}

/** What a parameter holds before anyone fills it in: false for a tick box, nothing for a number. */
export function defaultForType(type: string): any {
  const t = (type || '').toLowerCase();
  if (t === 'boolean') return false;
  if (t === 'integer' || t === 'decimal' || t === 'double') return null;
  return '';
}
