/**
 * Centered empty-state block for empty lists, tables, and views.
 * Shows an optional icon in a circle, a title, description, and action button.
 */

import type { ReactNode } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "8px",
    padding: "48px 16px",
  },
  iconCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "380px",
  },
  action: {
    marginTop: "8px",
  },
});

type Props = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      {icon && <div className={styles.iconCircle}>{icon}</div>}
      <Text size={400} weight="semibold" className={styles.title}>
        {title}
      </Text>
      {description && (
        <Text size={300} className={styles.description}>
          {description}
        </Text>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
