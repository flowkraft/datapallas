"use client";

/**
 * Avatar for the AI-Crew specialists (Hermes, Apollo, Pythia, Hephaestus) — a circular
 * head-medallion SVG per agent under /assets/<slug>/<slug>-head.svg, drawn in the same
 * flat outlined style as the Athena/Mnemosyne character art (skin #fce8d4, ink #2a1a10,
 * gold #d4af37) with each god's iconic attribute (winged petasos, laurel wreath, oracle
 * veil, smith's headband + beard). Same call shape as AthenaAvatar / MnemosyneAvatar
 * ({size} / {height}), so ChatAgentPage treats every agent's avatar identically.
 *
 * Agents without head art fall back to a themed monogram disc — add the SVG and the slug
 * to HEAD_ART and the monogram retires by itself.
 */
const HEAD_ART: Record<string, string> = {
  hermes: "/assets/hermes/hermes-head.svg",
  apollo: "/assets/apollo/apollo-head.svg",
  pythia: "/assets/pythia/pythia-head.svg",
  hephaestus: "/assets/hephaestus/hephaestus-head.svg",
};

// Standing full-body art (same 400x540 skeleton as athena/mnemosyne-talking.svg) —
// used by AgentAvatarFull for the chat empty state, exactly how AthenaFull /
// MnemosyneFull show the whole figure.
const FULL_ART: Record<string, string> = {
  hermes: "/assets/hermes/hermes-talking.svg",
  apollo: "/assets/apollo/apollo-talking.svg",
  pythia: "/assets/pythia/pythia-talking.svg",
  hephaestus: "/assets/hephaestus/hephaestus-talking.svg",
};

// Monogram fallback palette (agents with no art yet).
const PALETTE: Record<string, { from: string; to: string; label: string }> = {
  hermes: { from: "#38bdf8", to: "#0ea5e9", label: "He" },
  apollo: { from: "#fbbf24", to: "#f59e0b", label: "Ap" },
  pythia: { from: "#a78bfa", to: "#8b5cf6", label: "Py" },
  hephaestus: { from: "#fb923c", to: "#ea580c", label: "Hp" },
};
const FALLBACK = { from: "#94a3b8", to: "#64748b", label: "AI" };

export function AgentAvatar({ slug, size = 32, className = "" }: { slug: string; size?: number; className?: string }) {
  const art = HEAD_ART[slug];
  if (art) {
    // The medallion SVG is already a finished circular avatar (own disc + rim) — render as-is.
    return (
      <img
        src={art}
        alt={slug}
        className={className}
        style={{
          display: "inline-block",
          width: size,
          height: size,
          flexShrink: 0,
          verticalAlign: "middle",
          maxWidth: "none", // override Tailwind preflight's img{max-width:100%}
        }}
      />
    );
  }
  const c = PALETTE[slug] || FALLBACK;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        borderRadius: "50%",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        verticalAlign: "middle",
        background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.36,
        fontFamily: "Georgia, 'Times New Roman', serif",
        letterSpacing: "-0.02em",
        userSelect: "none",
      }}
    >
      {c.label}
    </span>
  );
}

/** The whole standing character for the empty state (same {height} contract as
 *  AthenaFull / MnemosyneFull). Falls back to the head medallion / monogram for
 *  agents without standing art. */
export function AgentAvatarFull({ slug, height = 150, className = "" }: { slug: string; height?: number; className?: string }) {
  const art = FULL_ART[slug];
  if (art) {
    return (
      <img
        src={art}
        alt={slug}
        className={className}
        style={{ height, width: "auto", maxWidth: "none", display: "inline-block" }}
      />
    );
  }
  return <AgentAvatar slug={slug} size={height} className={className} />;
}
