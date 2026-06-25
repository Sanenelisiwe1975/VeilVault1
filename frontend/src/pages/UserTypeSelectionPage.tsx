import { useNavigate } from "react-router-dom"

type UserType = "individual" | "stokvel" | "business":

interface Usercard {
    type : UserType;
    icon: string;
    label: string;
    description: string;
}

const USER_Cards: UseCard[] = [
    {
        type: "individual",
        icon: "👤",
        label: "Individual",
        description: "Manage personal assets and digital inheritance",
    },
    {
        type: "stockvel",
        icon: "🤝",
        label: "Stokvel",
        description: "Manage collective savings and governance",
    },
    {
        type: "business",
        icon: "🏢",
        label: "Business",
        description: "Protect company assets and succession planning",
    },
];

export default function UserTypeSelectionPage() {
  const navigate = useNavigate();

  const handleSelect = (type: UserType) => {
    localStorage.setItem("userType", type);
    navigate("/onboarding");
  };

  return (
    <div style={styles.root}>
      {/* Ambient grid overlay */}
      <div style={styles.gridOverlay} aria-hidden="true" />

      {/* Corner accent marks */}
      <svg style={styles.cornerTL} width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M0 40 L0 0 L40 0" stroke="rgba(139,92,246,0.4)" strokeWidth="1" fill="none" />
      </svg>
      <svg style={styles.cornerBR} width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M40 0 L40 40 L0 40" stroke="rgba(139,92,246,0.4)" strokeWidth="1" fill="none" />
      </svg>

      <main style={styles.main}>
        {/* Wordmark */}
        <div style={styles.wordmark}>
          <span style={styles.wordmarkV}>V</span>
          <span style={styles.wordmarkEIL}>EIL</span>
          <span style={styles.wordmarkSep}>·</span>
          <span style={styles.wordmarkVAULTS}>VAULTS</span>
        </div>

        {/* Headline */}
        <h1 style={styles.heading}>Who are you?</h1>
        <p style={styles.subheading}>
          Your vault is configured around your identity. Choose carefully — this shapes your experience.
        </p>

        {/* Cards */}
        <div style={styles.cardGrid} role="list">
          {USER_CARDS.map(({ type, icon, label, description }) => (
            <button
              key={type}
              style={styles.card}
              onClick={() => handleSelect(type)}
              onMouseEnter={(e) => applyHover(e.currentTarget, true)}
              onMouseLeave={(e) => applyHover(e.currentTarget, false)}
              onFocus={(e) => applyHover(e.currentTarget, true)}
              onBlur={(e) => applyHover(e.currentTarget, false)}
              aria-label={`Select ${label}`}
              role="listitem"
            >
              {/* Top glow bar */}
              <div style={styles.cardGlowBar} className={`glow-bar-${type}`} aria-hidden="true" />

              <div style={styles.cardInner}>
                <span style={styles.cardIcon} aria-hidden="true">{icon}</span>
                <div style={styles.cardText}>
                  <span style={styles.cardLabel}>{label}</span>
                  <span style={styles.cardDescription}>{description}</span>
                </div>
                {/* Arrow */}
                <svg style={styles.cardArrow} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10H16M16 10L10 4M16 10L10 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Footer note */}
        <p style={styles.footnote}>
          You can update your profile type at any time from settings.
        </p>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #080B14;
          font-family: 'Space Grotesk', sans-serif;
        }

        button {
          cursor: pointer;
          border: none;
          background: none;
          font-family: inherit;
          text-align: left;
        }

        .glow-bar-individual { background: linear-gradient(90deg, transparent, #7C3AED, transparent); }
        .glow-bar-stokvel    { background: linear-gradient(90deg, transparent, #0EA5E9, transparent); }
        .glow-bar-business   { background: linear-gradient(90deg, transparent, #10B981, transparent); }

        @media (max-width: 640px) {
          .card-grid { grid-template-columns: 1fr !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; }
        }
      `}</style>
    </div>
  );
}

//  Inline hover helper (avoids styled-components dep) 
function applyHover(el: HTMLButtonElement, active: boolean) {
  el.style.background = active
    ? "rgba(139,92,246,0.08)"
    : "rgba(255,255,255,0.03)";
  el.style.borderColor = active
    ? "rgba(139,92,246,0.5)"
    : "rgba(255,255,255,0.08)";
  el.style.transform = active ? "translateY(-2px)" : "translateY(0)";
}

// Styles 
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#080B14",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    padding: "24px",
  },

  gridOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },

  cornerTL: {
    position: "absolute",
    top: 24,
    left: 24,
    pointerEvents: "none",
  },
  cornerBR: {
    position: "absolute",
    bottom: 24,
    right: 24,
    pointerEvents: "none",
  },

  main: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 680,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
  },

  // Wordmark
  wordmark: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    letterSpacing: "0.25em",
    marginBottom: 48,
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    userSelect: "none",
  },
  wordmarkV: {
    color: "#7C3AED",
    fontWeight: 700,
    fontSize: 16,
  },
  wordmarkEIL: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: 400,
  },
  wordmarkSep: {
    color: "rgba(139,92,246,0.5)",
    margin: "0 4px",
  },
  wordmarkVAULTS: {
    color: "rgba(255,255,255,0.4)",
    fontWeight: 400,
    letterSpacing: "0.3em",
  },

  // Headline
  heading: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "clamp(28px, 5vw, 40px)",
    fontWeight: 600,
    color: "#FFFFFF",
    letterSpacing: "-0.02em",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 1.2,
  },

  subheading: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 15,
    fontWeight: 300,
    color: "rgba(255,255,255,0.38)",
    textAlign: "center",
    lineHeight: 1.6,
    maxWidth: 400,
    marginBottom: 48,
  },

  // Card grid
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    width: "100%",
    marginBottom: 32,
  },

  card: {
    position: "relative",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 0,
    overflow: "hidden",
    cursor: "pointer",
    transition: "background 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
    outline: "none",
  },

  cardGlowBar: {
    height: 1,
    width: "100%",
    opacity: 0.6,
  },

  cardInner: {
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
  },

  cardIcon: {
    fontSize: 28,
    lineHeight: 1,
    display: "block",
  },

  cardText: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
  },

  cardLabel: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: "rgba(255,255,255,0.92)",
    letterSpacing: "-0.01em",
  },

  cardDescription: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 12,
    fontWeight: 300,
    color: "rgba(255,255,255,0.38)",
    lineHeight: 1.5,
  },

  cardArrow: {
    color: "rgba(139,92,246,0.5)",
    alignSelf: "flex-end",
    transition: "color 0.2s ease",
    flexShrink: 0,
  },

  // Footnote
  footnote: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center",
    letterSpacing: "0.05em",
  },
};
