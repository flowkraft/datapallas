/**
 * The query string a tile asks its report's data with, made from the filter values it was given.
 *
 * <p>A filter nobody has set is not a value: a number box left empty holds null (see
 * {@code defaultForType}), and `new URLSearchParams` writes null as the word "null", which the server
 * then reads as a number it cannot parse. Such a filter is left out of the request, so the report
 * sees it as not given, exactly as it does when the page opens with no filters at all.
 */
export function reportQuery(values: Record<string, unknown> | null | undefined): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values ?? {})) {
    if (value === null || value === undefined) continue;
    query.append(name, String(value));
  }
  return query;
}
