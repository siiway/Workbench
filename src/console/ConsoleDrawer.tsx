/**
 * Bottom-attached console drawer — visible on every page except /console
 * itself (where the dedicated page already provides the same UI).
 */

import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useLocation } from "react-router-dom";
import { Console } from "./Console";
import { useConsole } from "./ConsoleProvider";

const useStyles = makeStyles({
  wrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: "320px",
    maxHeight: "60vh",
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `2px solid ${tokens.colorNeutralStroke1}`,
    transform: "translateY(100%)",
    transition: "transform 180ms ease-out",
    zIndex: 100,
  },
  open: {
    transform: "translateY(0)",
  },
});

type Props = { teamId: string };

export function ConsoleDrawer({ teamId }: Props) {
  const styles = useStyles();
  const { drawerOpen, setDrawerOpen } = useConsole();
  const location = useLocation();

  // Suppressed on the dedicated console page.
  if (location.pathname === "/console") return null;

  return (
    <div className={mergeClasses(styles.wrap, drawerOpen && styles.open)}>
      <Console
        teamId={teamId}
        showClose
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
