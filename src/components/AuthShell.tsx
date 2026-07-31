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
    backgroundColor: tokens.colorNeutralBackground1,
    position: "relative",
    overflow: "hidden",
  },
  card: {
    "--auth-card-pad": "32px",
    width: "100%",
    borderRadius: "14px",
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground1,
    display: "flex",
    flexDirection: "column",
    padding: "var(--auth-card-pad)",
    animationName: {
      from: { opacity: 0, transform: "translateY(10px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    animationDuration: "0.35s",
    animationTimingFunction: "cubic-bezier(0.33, 1, 0.68, 1)",
    animationFillMode: "both",
    "@media (max-width: 480px)": {
      "--auth-card-pad": "24px",
    },
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
    },
  },
});

type Props = {
  children: ReactNode;
  maxWidth?: number;
  cardGap?: number;
  style?: CSSProperties;
};

export function AuthShell({ children, maxWidth = 400, cardGap = 20, style }: Props) {
  const styles = useStyles();
  return (
    <div className={`${styles.page} auth-grid`}>
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
