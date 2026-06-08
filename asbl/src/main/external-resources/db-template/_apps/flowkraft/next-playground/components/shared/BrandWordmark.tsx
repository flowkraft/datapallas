/**
 * DataPallas wordmark — matches the official reportburster.com logo.
 *
 * "Data"   → italic, inherits the surrounding foreground color (white on the
 *            dark navbar). Never hardcode white so it stays readable on any theme.
 * "Pallas" → upright (normal), terracotta brand color #d18361 (hsl(18 55% 60%)).
 *
 * Both use Cormorant Garamond 700, self-hosted via next/font (see app/layout.tsx,
 * --font-brand). The font is bundled at build time, so this renders fully offline.
 */
export function BrandWordmark() {
  const fontFamily =
    "var(--font-brand), ui-serif, Georgia, 'Times New Roman', serif";
  return (
    <span
      className="text-2xl tracking-tight"
      style={{ fontFamily, fontWeight: 700 }}
    >
      <span style={{ fontStyle: "italic", color: "currentColor" }}>Data</span>
      <span style={{ fontStyle: "normal", color: "#d18361" }}>Pallas</span>
    </span>
  );
}
