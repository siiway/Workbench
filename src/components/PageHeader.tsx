/**
 * Standard page header with title, optional subtitle, and optional actions.
 * Provides consistent spacing and typography across all pages.
 */

import type { CSSProperties, ReactNode } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "24px",
  },
  titles: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexShrink: 0,
    alignItems: "center",
  },
});

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
};

export function PageHeader({ title, subtitle, actions, style }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.root} style={style}>
      <div className={styles.titles}>
        <Text size={600} weight="bold">
          {title}
        </Text>
        {subtitle && (
          <Text size={300} className={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
