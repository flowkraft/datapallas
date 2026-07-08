/**
 * DataPallas wordmark — mirrors the main app's brand component
 * (frend/reporting/src/app/components/brand/brand.component.html).
 *
 * "Data"   → italic, inherits the surrounding foreground color (white on the
 *            dark navbar). Never hardcode white so it stays readable on any theme.
 * "Pallas" → upright (normal), terracotta brand color #d18361 (hsl(18 55% 60%)).
 *
 * Font is Georgia — a serif that ships on every Windows (with true bold/italic
 * faces), so the app never depends on a webfont. The marketing site uses
 * Cormorant Garamond; the apps stay on the safe Georgia.
 */
export function BrandWordmark() {
  return (
    <span
      className="text-3xl tracking-tight"
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <span style={{ fontStyle: "italic", color: "currentColor" }}>Data</span>
      <span style={{ fontStyle: "normal", color: "#d18361" }}>Pallas</span>
    </span>
  );
}
