/**
 * Shared shell for auth-style centered-card pages (login, init, etc.).
 * Guarantees pixel-identical layout across all auth flows.
 * Exposes --auth-card-pad CSS var so full-bleed children can stretch edge-to-edge.
 */

import type { CSSProperties, ReactNode } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    gap: "20px",
    padding: "32px 16px",
    backgroundColor: tokens.colorNeutralBackground2,
    position: "relative",
    overflow: "hidden",
    // Soft brand blooms from opposite corners
    backgroundImage: `
      radial-gradient(ellipse at 20% 20%, color-mix(in srgb, ${tokens.colorBrandBackground} 8%, transparent) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 80%, color-mix(in srgb, ${tokens.colorBrandBackground} 8%, transparent) 0%, transparent 60%)
    `,
    "@media (prefers-reduced-motion: reduce)": {
      // No entrance animation
    },
  },
  card: {
    "--auth-card-pad": "40px",
    width: "100%",
    borderRadius: "12px",
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    background: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    display: "flex",
    flexDirection: "column",
    padding: "var(--auth-card-pad)",
    animationName: "authCardEnter",
    animationDuration: "0.35s",
    animationTimingFunction: "cubic-bezier(0.33, 1, 0.68, 1)",
    animationFillMode: "both",
    "@media (max-width: 480px)": {
      "--auth-card-pad": "28px",
    },
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
  // Keyframes injected via style tag in the component
});

// Inject keyframes once
const keyframeStyle = document.createElement("style");
keyframeStyle.textContent = `
@keyframes authCardEnter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;
if (!document.getElementById("auth-card-keyframes")) {
  keyframeStyle.id = "auth-card-keyframes";
  document.head.appendChild(keyframeStyle);
}

type Props = {
  children: ReactNode;
  maxWidth?: number;
  cardGap?: number;
  style?: CSSProperties;
};

export function AuthShell({ children, maxWidth = 400, cardGap = 20, style }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <div
        className={styles.card}
        style={{
          maxWidth: `${maxWidth}px`,
          gap: `${cardGap}px`,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
