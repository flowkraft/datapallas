/**
 * MnemosyneAvatar — a small circular avatar showing Mnemosyne's head/shoulders,
 * for chat message bubbles (parallel to AthenaAvatar). Uses object-fit: cover with
 * a top anchor so the head fills the disc without hand-tuned crop ratios — robust
 * to the SVG's native viewBox.
 */
export function MnemosyneAvatar({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        verticalAlign: "middle",
        background: "var(--color-base-200, #efeae1)",
      }}
    >
      <img
        src="/assets/mnemosyne/mnemosyne-talking.svg"
        alt="Mnemosyne"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          maxWidth: "none", // override Tailwind preflight's img{max-width:100%}
        }}
      />
    </span>
  );
}

/**
 * MnemosyneFull — the whole standing Mnemosyne character (goddess of memory &
 * learning), the same art used in the DataZeus / DataPallas learning videos.
 * Parallel to AthenaFull; used for the "Chat with Mnemosyne" hero on the Agents
 * page. Height-based with width:auto, so it stays crisp and undistorted at any
 * size regardless of the SVG's native viewBox.
 */
export function MnemosyneFull({
  height = 150,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="/assets/mnemosyne/mnemosyne-talking.svg"
      alt="Mnemosyne"
      className={className}
      style={{ height, width: "auto", maxWidth: "none", display: "inline-block" }}
    />
  );
}
