/**
 * AthenaAvatar — a circular, head-only crop of Athena's character illustration
 * (the same art used in the DataPallas intro videos). The full-body SVG is
 * positioned inside an overflow-hidden circle so only the head shows, replacing
 * the old owl emoji. Being an SVG, it stays crisp at any size.
 *
 * Crop ratios (relative to the circle diameter) match the video's CharacterHead
 * component, tuned for the athena-greek full-body art so the head fills the disc.
 */
export function AthenaAvatar({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  // Reproduces the intro video's CharacterHead head-crop EXACTLY. CharacterHead
  // sets width = 1.83·d and height = 1.35·width, letting the browser letterbox
  // the 400:700 SVG. The values below are that same letterbox result expressed
  // with height:auto — pixel-identical to the video, but the native aspect is
  // kept so it can never be distorted (only one dimension is ever constrained).
  const W_RATIO = 1.4117; // letterbox-equivalent of the video's 1.83 width
  const OX_RATIO = -0.2059; // = -0.415 + (1.83 - 1.4117)/2, keeps the head centered
  const OY_RATIO = -0.287; // same vertical offset as the video

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      <img
        src="/assets/athena/athena-talking.svg"
        alt="Athena"
        style={{
          position: "absolute",
          left: size * OX_RATIO,
          top: size * OY_RATIO,
          width: size * W_RATIO,
          height: "auto", // keep the SVG's native aspect — no distortion
          maxWidth: "none", // override Tailwind preflight's img{max-width:100%}
        }}
      />
    </span>
  );
}

/**
 * AthenaFull — the whole standing character (not just the head). Used where we
 * want users to recognise the full figure at a glance, e.g. the Chat2DB empty
 * state. Being an SVG it stays crisp at any size.
 */
export function AthenaFull({
  height = 150,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="/assets/athena/athena-talking.svg"
      alt="Athena"
      className={className}
      style={{ height, width: "auto", maxWidth: "none", display: "inline-block" }}
    />
  );
}
