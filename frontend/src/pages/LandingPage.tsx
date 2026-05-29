import React, { useState, useEffect, useRef } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon } from "../components/ui";
import { useIsMobile } from "../hooks";


const STYLES = `
  @keyframes blurIn {
    from { opacity:0; filter:blur(6px); transform:translateY(16px); }
    to   { opacity:1; filter:blur(0);   transform:translateY(0);    }
  }
  @keyframes pulse-glow {
    0%,100% { box-shadow: 0 0 60px rgba(107,94,224,0.20); }
    50%     { box-shadow: 0 0 100px rgba(107,94,224,0.38); }
  }
  .lp-section { animation: blurIn 0.65s ease both; }
  .cube-wrap { animation: pulse-glow 4s ease-in-out infinite; }
  .nav-link-line::after {
    content:''; display:block; height:2px;
    width:0; background:${colors.primary};
    transition:width 0.25s;
  }
  .nav-link-line:hover::after { width:100%; }
  .step-card:hover .step-icon { transform:scale(1.12); }
  .step-icon { transition:transform 0.25s; }
`;

// ─── Chain data for each cube face ───────────────────────────────────────────

const CHAIN_FACES = [
  { rotation: "",              icon: "circle",            label: "Solana",     sublabel: "Native settlement",  color: "#9945FF" },
  { rotation: "rotateY(180deg)", icon: "currency_bitcoin",label: "Bitcoin",    sublabel: "Ika dWallet",        color: "#F7931A" },
  { rotation: "rotateY(90deg)",  icon: "token",           label: "Ethereum",   sublabel: "Ika dWallet",        color: "#627EEA" },
  { rotation: "rotateY(-90deg)", icon: "real_estate_agent",label: "RWAs",      sublabel: "Ika dWallet",        color: colors.secondary },
  { rotation: "rotateX(90deg)",  icon: "lock",            label: "FHE",        sublabel: "Encrypt REFHE",      color: colors.primary },
  { rotation: "rotateX(-90deg)", icon: "hub",             label: "Bridgeless", sublabel: "No wrapping",        color: colors.tertiary },
];

// ─── Cube ─────────────────────────────────────────────────────────────────────

const Cube3D: React.FC = () => {
  const cubeRef    = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging   = useRef(false);
  const isOpen     = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });
  const rot        = useRef({ x: -20, y: 45 });
  const [open,   setOpen]   = useState(false);
  const [cursor, setCursor] = useState<"grab" | "grabbing" | "pointer">("grab");

  // RAF auto-rotate — pauses while dragging or open
  useEffect(() => {
    let id: number;
    const tick = () => {
      if (!dragging.current && !isOpen.current && cubeRef.current) {
        rot.current.y += 0.25;
        cubeRef.current.style.transform =
          `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  // Document: mouse tracking + release (all passive — doesn't block scroll)
  useEffect(() => {
    const applyMove = (cx: number, cy: number) => {
      if (!dragging.current || !cubeRef.current) return;
      rot.current.y += (cx - lastPos.current.x) * 0.5;
      rot.current.x -= (cy - lastPos.current.y) * 0.5;
      cubeRef.current.style.transform =
        `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`;
      lastPos.current = { x: cx, y: cy };
    };
    const onMouseMove = (e: MouseEvent) => applyMove(e.clientX, e.clientY);
    const onUp = () => { dragging.current = false; setCursor(isOpen.current ? "pointer" : "grab"); };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchend",  onUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchend",  onUp);
    };
  }, []);

  // Cube wrapper: non-passive touchmove — only on the cube element, not the whole page.
  // This lets users scroll the landing page freely; drag-to-rotate only activates
  // when a touch starts on the cube itself (dragging.current is set in startDrag).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current || !cubeRef.current) return;
      const t = e.touches[0];
      rot.current.y += (t.clientX - lastPos.current.x) * 0.5;
      rot.current.x -= (t.clientY - lastPos.current.y) * 0.5;
      cubeRef.current.style.transform =
        `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`;
      lastPos.current = { x: t.clientX, y: t.clientY };
      e.preventDefault(); // safe: only fires when user started drag on cube
    };
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => wrapper.removeEventListener("touchmove", onTouchMove);
  }, []);

  const startDrag = (x: number, y: number) => {
    if (isOpen.current) return; // no drag when open
    dragging.current = true;
    lastPos.current  = { x, y };
    setCursor("grabbing");
  };

  const toggleOpen = () => {
    if (dragging.current) return;
    const next = !isOpen.current;
    isOpen.current = next;
    setOpen(next);
    setCursor(next ? "pointer" : "grab");
  };

  const depth = open ? 330 : 150;

  return (
    <>
      {/* Dim overlay when open */}
      {open && (
        <div
          onClick={toggleOpen}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 98,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      <div style={{
        perspective: 1000,
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 40, paddingBottom: 16, userSelect: "none",
        position: "relative", zIndex: open ? 99 : 1,
      }}>
        <div
          ref={wrapperRef}
          className={open ? "" : "cube-wrap"}
          style={{ width: 300, height: 300, position: "relative", borderRadius: 8, cursor, overflow: "visible" }}
          onMouseDown={e => startDrag(e.clientX, e.clientY)}
          onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onClick={open ? toggleOpen : undefined}
        >
          <div
            ref={cubeRef}
            style={{
              width: 300, height: 300,
              position: "relative", transformStyle: "preserve-3d",
              transform: `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`,
            }}
          >
            {CHAIN_FACES.map(({ rotation, icon, label, sublabel, color }) => (
              <div
                key={label}
                onClick={toggleOpen}
                style={{
                  position:       "absolute",
                  width:          300, height: 300,
                  background:     open ? `${color}18` : "rgba(107,94,224,0.08)",
                  border:         `1.5px solid ${open ? color + "55" : "rgba(198,192,255,0.30)"}`,
                  backdropFilter: "blur(12px)",
                  display:        "flex",
                  flexDirection:  "column",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            10,
                  transform:      `${rotation} translateZ(${depth}px)`,
                  transition:     "transform 0.65s cubic-bezier(0.34,1.3,0.64,1), background 0.4s, border-color 0.4s",
                  cursor:         "pointer",
                }}
              >
                <MaterialIcon name={icon} size={open ? 44 : 72} style={{ color, opacity: 0.85, transition: "font-size 0.3s" }} />
                {open && (
                  <div style={{ textAlign: "center", animation: "blurIn 0.35s ease 0.2s both" }}>
                    <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 4 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {sublabel}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 12 }}>
          {open ? "Click any face to close" : "Drag to rotate · Click to explore chains"}
        </p>
      </div>
    </>
  );
};


const NAV_LINKS = ["About", "How It Works", "Features", "Why VeilVault"];

const Navbar: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const isMobile = useIsMobile();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      position:       "fixed",
      top: 0, left: 0, right: 0,
      zIndex:         100,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        isMobile ? "0 20px" : "0 48px",
      height:         64,
      background:     scrolled ? `${colors.surface}cc` : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      transition:     "background 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src="/logo.jpg" alt="Veil Vault" style={{ height: 32, width: 32, borderRadius: 8, objectFit: "cover" }} />
        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: fontFamily.headline, color: colors.primary }}>
          Veil Vault
        </span>
      </div>

      {!isMobile && (
        <div style={{ display: "flex", gap: 36 }}>
          {NAV_LINKS.map(l => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/\s/g, "-")}`}
              className="nav-link-line"
              style={{
                color: colors.onSurfaceVariant, fontSize: 14,
                fontFamily: fontFamily.headline, fontWeight: 500,
                textDecoration: "none", cursor: "pointer",
                transition: "color 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.tertiary)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.onSurfaceVariant)}
            >{l}</a>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {!isMobile && (
          <MaterialIcon name="account_balance_wallet" size={22} style={{ color: colors.primary, cursor: "pointer" }} />
        )}
        <button type="button" onClick={onLaunch} style={{
          padding: "8px 22px", fontSize: 13, fontWeight: 700,
          fontFamily: fontFamily.headline,
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
          color: colors.onPrimary, border: "none", borderRadius: 6, cursor: "pointer",
        }}>
          Launch App
        </button>
      </div>
    </nav>
  );
};

const Hero: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const isMobile = useIsMobile();
  return (
    <section style={{
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: isMobile ? "100px 24px 60px" : "100px 48px 60px",
      textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 50%, rgba(107,94,224,0.12), transparent 70%)",
        pointerEvents: "none",
      }} />

      <h1 style={{
        fontFamily: fontFamily.headline,
        fontSize: isMobile ? "2.6rem" : "4.4rem",
        fontWeight: 900,
        letterSpacing: "-0.03em",
        lineHeight: 1.1,
        color: "#fff",
        marginBottom: 20,
        maxWidth: 820,
        background: `linear-gradient(180deg, ${colors.onSurface} 0%, ${colors.primaryContainer} 100%)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      } as React.CSSProperties}>
        Privacy Meets Power in a Multi-Chain World
      </h1>

      <p style={{
        color: colors.onSurfaceVariant, fontSize: isMobile ? 15 : 18,
        lineHeight: 1.75, maxWidth: 580, marginBottom: 40, fontWeight: 300,
      }}>
        VeilVaults is a decentralised vault system that lets you securely store, manage,
        and interact with assets across multiple blockchains — without compromising privacy.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 60 }}>
        <button type="button" onClick={onLaunch} style={{
          padding: "14px 36px", fontSize: 16, fontWeight: 700,
          fontFamily: fontFamily.headline,
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
          color: colors.onPrimary, border: "none", borderRadius: 6, cursor: "pointer",
        }}>
          Get Started
        </button>
        <button type="button" onClick={onLaunch} style={{
          padding: "14px 36px", fontSize: 16, fontWeight: 700,
          fontFamily: fontFamily.headline,
          background: `${colors.surfaceContainerHighest}66`,
          backdropFilter: "blur(10px)",
          color: colors.primary,
          border: `1px solid ${colors.primary}30`,
          borderRadius: 6, cursor: "pointer",
        }}>
          Explore Vaults
        </button>
      </div>

      <Cube3D />
    </section>
  );
};

//Multi-Chain Vault section

const MultiChainSection: React.FC = () => {
  const isMobile = useIsMobile();
  return (
    <section className="lp-section" style={{
      padding: isMobile ? "64px 24px" : "96px 10%",
      background: colors.surfaceContainerLow,
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
      gap: isMobile ? 48 : 80,
      alignItems: "center",
    }}>
      <div>
        <h2 style={{
          fontFamily: fontFamily.headline,
          fontSize: isMobile ? "2rem" : "3rem",
          fontWeight: 800, letterSpacing: "-0.03em",
          color: colors.primary, marginBottom: 20, lineHeight: 1.15,
        }}>
          Explore the Multi-Chain Vault
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 16, lineHeight: 1.8, marginBottom: 28 }}>
          At the heart of VeilVaults is a dynamic vault interface. Each face of the cube represents
          a different blockchain ecosystem, allowing you to rotate between your diverse portfolios
          with cryptographic precision.
        </p>
        {[
          { icon: "hub",           label: "Unified Chain Logic"    },
          { icon: "auto_awesome",  label: "Instant Portability"    },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <MaterialIcon name={icon} size={18} style={{ color: colors.tertiary }} />
            <span style={{ fontWeight: 500, color: colors.onSurface, fontSize: 14 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Animated box */}
      <div style={{
        position: "relative", height: isMobile ? 280 : 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: colors.surfaceContainer,
        borderRadius: 24, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, ${colors.primaryContainer}18, ${colors.secondaryContainer}10)`,
        }} />
        <div style={{
          position: "relative", zIndex: 1,
          width: isMobile ? 140 : 200, height: isMobile ? 140 : 200,
          border: `3px dashed ${colors.primary}40`,
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulse-glow 3s ease-in-out infinite",
        }}>
          <div style={{
            background: `${colors.primary}22`,
            borderRadius: "50%", padding: 24,
          }}>
            <MaterialIcon name="deployed_code" size={isMobile ? 56 : 80} style={{ color: colors.primary }} />
          </div>
        </div>
      </div>
    </section>
  );
};

const AboutSection: React.FC = () => {
  const isMobile = useIsMobile();
  return (
    <section id="about" className="lp-section" style={{
      padding: isMobile ? "64px 24px" : "100px 10%",
      textAlign: "center", maxWidth: 900, margin: "0 auto",
    }}>
      <div style={{
        display: "inline-block", padding: "4px 16px",
        borderRadius: 20,
        background: `${colors.secondaryContainer}40`,
        border: `1px solid ${colors.secondary}20`,
        color: colors.primaryFixed, fontSize: 11,
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em",
        marginBottom: 28,
      }}>
        The Foundation
      </div>
      <h2 style={{
        fontFamily: fontFamily.headline,
        fontSize: isMobile ? "2.2rem" : "3.5rem",
        fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", marginBottom: 28,
      }}>
        What is VeilVaults?
      </h2>
      <p style={{ color: colors.onSurfaceVariant, fontSize: isMobile ? 16 : 20, lineHeight: 1.8, fontWeight: 300 }}>
        VeilVaults is a decentralised application (dApp) that helps you securely manage your digital assets
        across different blockchains in one place. Instead of juggling multiple wallets and platforms,
        VeilVaults gives you a{" "}
        <span style={{ color: colors.primary, fontWeight: 600 }}>unified, privacy-focused vault</span>{" "}
        where your assets remain under your control at all times.
      </p>
    </section>
  );
};

//How It Works (bento grid)

const STEPS = [
  { n: "01", icon: "account_balance_wallet", color: colors.primary,    title: "Connect Wallet",       desc: "Securely link your existing EOA or hardware wallet via our encrypted bridge protocol." },
  { n: "02", icon: "view_in_ar",             color: colors.tertiary,   title: "Create Your Vault",    desc: "Initialize your multi-chain interaction setup with personalised security parameters." },
  { n: "03", icon: "account_balance",        color: colors.secondary,  title: "Deposit & Manage",     desc: "Transfer assets into the vault. View your global balance across all chains in real-time." },
];

const HowItWorksSection: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const isMobile = useIsMobile();
  return (
    <section id="how-it-works" className="lp-section" style={{
      padding: isMobile ? "64px 24px" : "96px 10%",
      background: colors.surfaceContainerLow,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 40 }}>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? "2rem" : "3rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
          How VeilVaults Works
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 14, maxWidth: 280 }}>
          A seamless flow from connection to multi-chain mastery.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        {STEPS.map(({ n, icon, color, title, desc }) => (
          <div key={n} className="step-card" style={{
            padding: 28, background: colors.surfaceContainerHigh,
            borderRadius: 8, cursor: "default",
            transition: "background 0.25s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = colors.surfaceContainerHighest)}
          onMouseLeave={e => (e.currentTarget.style.background = colors.surfaceContainerHigh)}
          >
            <div className="step-icon" style={{
              width: 44, height: 44, borderRadius: 4,
              background: `${color}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 20,
            }}>
              <MaterialIcon name={icon} size={26} style={{ color }} />
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.15em", marginBottom: 8 }}>
              STEP {n}
            </p>
            <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 10 }}>
              {title}
            </p>
            <p style={{ color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 1.65 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* Bottom row: spanning card + CTA */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 16 }}>
        <div style={{
          padding: 28, background: colors.surfaceContainerHigh, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 24,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.15em", marginBottom: 8 }}>STEP 04 &amp; 05</p>
            <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 20, color: "#fff", marginBottom: 10 }}>
              Privacy &amp; Cross-Chain Power
            </p>
            <p style={{ color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 1.65 }}>
              Utilize our advanced cryptographic privacy layer to move assets across chains with
              total invisibility and zero friction.
            </p>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {[
              { icon: "security", color: colors.primary },
              { icon: "swap_calls", color: colors.tertiary },
            ].map(({ icon, color }) => (
              <div key={icon} style={{
                width: 72, height: 72, borderRadius: "50%",
                background: `${color}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <MaterialIcon name={icon} size={34} style={{ color }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{
          padding: 28,
          background: `linear-gradient(135deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
          borderRadius: 8,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 18, color: colors.onPrimary, marginBottom: 8 }}>
              Start Securing Now
            </p>
            <p style={{ color: `${colors.onPrimary}bb`, fontSize: 13, lineHeight: 1.55 }}>
              Your encrypted vault is one transaction away.
            </p>
          </div>
          <button type="button" onClick={onLaunch} style={{
            marginTop: 24, padding: "10px 0", width: "100%",
            background: "#fff", color: colors.primaryContainer,
            border: "none", borderRadius: 4,
            fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13,
            cursor: "pointer",
          }}>
            Launch Dashboard
          </button>
        </div>
      </div>
    </section>
  );
};

//Features

const FEATURES = [
  { icon: "verified_user", color: colors.primary,   title: "Non-Custodial Security",      desc: "Your keys, your crypto. We never hold your assets. All interactions are signed locally on your device." },
  { icon: "hub",           color: colors.tertiary,  title: "Multi-Chain Support",          desc: "Seamlessly integrated with Ethereum, Solana, Polygon, and Avalanche with more being added monthly." },
  { icon: "view_in_ar",    color: colors.secondary, title: "Interactive Interface",        desc: "A revolutionary 3D vault experience that makes complex on-chain management feel intuitive and visual." },
  { icon: "fingerprint",   color: colors.primary,   title: "Privacy-First Architecture",  desc: "Leveraging Zero-Knowledge Proofs and MPC to ensure your transaction history remains your business." },
  { icon: "bolt",          color: colors.tertiary,  title: "Fast Transactions",            desc: "Optimised routing and batch processing mean your cross-chain moves happen in seconds, not minutes." },
  { icon: "analytics",     color: colors.secondary, title: "Unified Analytics",            desc: "Deep insights into your entire multi-chain portfolio with professional-grade charting and reporting." },
];

const FeaturesSection: React.FC = () => {
  const isMobile = useIsMobile();
  return (
    <section id="features" className="lp-section" style={{ padding: isMobile ? "64px 24px" : "100px 10%" }}>
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? "2rem" : "3rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 12 }}>
          Core Protocol Features
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 15 }}>
          Precision engineered for the sovereign individual.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 36 : 48 }}>
        {FEATURES.map(({ icon, color, title, desc }) => (
          <div key={title} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <MaterialIcon name={icon} size={36} style={{ color }} />
            <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 17, color: "#fff" }}>{title}</p>
            <p style={{ color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 1.7 }}>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

// Why VeilVaults

const WHY_ITEMS = [
  "Consolidate 12+ wallets into a single cryptographic interface.",
  "Reduce cross-chain gas fees by up to 40% via optimised batching.",
];

const WhySection: React.FC = () => {
  const isMobile = useIsMobile();
  return (
    <section id="why" className="lp-section" style={{
      padding: isMobile ? "64px 24px" : "96px 10%",
      background: colors.surfaceContainer,
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
      gap: isMobile ? 40 : 64,
      alignItems: "center",
    }}>
      {/* Dashboard mockup */}
      <div style={{
        background: colors.surfaceContainerLow,
        borderRadius: 16, padding: 24,
        filter: "grayscale(60%)",
        transition: "filter 0.6s",
        cursor: "default",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.filter = "grayscale(0%)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.filter = "grayscale(60%)")}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {["#f87171", "#fbbf24", "#4ade80"].map(c => (
            <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ width: "35%", height: 80, background: `${colors.primaryContainer}30`, borderRadius: 8 }} />
          <div style={{ flex: 1, height: 80, background: `${colors.surfaceContainerHighest}`, borderRadius: 8 }} />
        </div>
        {[80, 55, 70, 42].map((w, i) => (
          <div key={i} style={{ height: 7, width: `${w}%`, background: i === 0 ? `${colors.primary}55` : colors.surfaceContainerHighest, borderRadius: 4, marginBottom: 8 }} />
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          {[colors.primaryContainer, colors.secondaryContainer].map((bg, i) => (
            <div key={i} style={{ height: 52, background: `${bg}50`, borderRadius: 8 }} />
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? "2rem" : "2.8rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 20 }}>
          Why VeilVaults?
        </h2>
        <p style={{ fontSize: isMobile ? 16 : 19, color: colors.onSurfaceVariant, lineHeight: 1.7, fontStyle: "italic", marginBottom: 32 }}>
          "Traditional crypto tools are fragmented. VeilVaults simplifies everything by combining
          security, privacy, and multi-chain accessibility into one powerful platform."
        </p>
        {WHY_ITEMS.map(item => (
          <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <MaterialIcon name="done_all" size={18} style={{ color: colors.primary, flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: colors.onSurface, fontSize: 14, lineHeight: 1.6 }}>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

// CTA

const CTASection: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const isMobile = useIsMobile();
  return (
    <section className="lp-section" style={{
      padding: isMobile ? "80px 24px" : "120px 10%",
      textAlign: "center", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(107,94,224,0.12), transparent)",
        pointerEvents: "none",
      }} />
      <h2 style={{
        fontFamily: fontFamily.headline,
        fontSize: isMobile ? "2.2rem" : "3.5rem",
        fontWeight: 900, letterSpacing: "-0.03em", color: "#fff",
        marginBottom: 20, lineHeight: 1.15,
      }}>
        Ready to take control<br />of your assets?
      </h2>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", paddingTop: 8 }}>
        <button type="button" onClick={onLaunch} style={{
          padding: "16px 48px", fontSize: 17, fontWeight: 700,
          fontFamily: fontFamily.headline,
          background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryContainer})`,
          color: colors.onPrimary, border: "none", borderRadius: 6, cursor: "pointer",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          Launch App
        </button>
        <button type="button" style={{
          padding: "16px 48px", fontSize: 17, fontWeight: 700,
          fontFamily: fontFamily.headline, background: "transparent",
          color: colors.onSurface,
          border: `1.5px solid ${colors.outlineVariant}`,
          borderRadius: 6, cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = colors.surfaceContainerHigh)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          Learn More
        </button>
      </div>
    </section>
  );
};

// Footer

const FOOTER_LINKS = ["Privacy Protocol", "Security Audit", "Documentation", "Github", "Status"];

const Footer: React.FC = () => {
  const isMobile = useIsMobile();
  return (
    <footer style={{
      borderTop: `1px solid ${colors.surfaceContainerHighest}50`,
      background: colors.surface,
      padding: isMobile ? "32px 24px" : "40px 10%",
      display: "flex", flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "center",
      justifyContent: "space-between",
      gap: 20,
    }}>
      <span style={{ fontSize: 17, fontWeight: 900, color: colors.primary, fontFamily: fontFamily.headline, letterSpacing: "-0.02em" }}>
        Veil Vaults
      </span>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {FOOTER_LINKS.map(l => (
          <a key={l} href="#" style={{
            fontSize: 12, color: "#64748b", textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.primaryContainer)}
          onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
          >{l}</a>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#334155" }}>
        © 2026 Veil Vaults. Cryptographic Excellence.
      </p>
    </footer>
  );
};

// Root

export const LandingPage: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => (
  <>
    <style>{STYLES}</style>
    <div style={{ background: colors.surface, minHeight: "100vh", color: colors.onSurface, fontFamily: fontFamily.body }}>
      <Navbar    onLaunch={onLaunch} />
      <Hero      onLaunch={onLaunch} />
      <MultiChainSection />
      <AboutSection />
      <HowItWorksSection onLaunch={onLaunch} />
      <FeaturesSection />
      <WhySection />
      <CTASection onLaunch={onLaunch} />
      <Footer />
    </div>
  </>
);
