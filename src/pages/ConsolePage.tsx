import { makeStyles } from "@fluentui/react-components";
import { Console } from "../console/Console";

const useStyles = makeStyles({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
});

type Props = { teamId: string };

export function ConsolePage({ teamId }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <Console teamId={teamId} visible />
    </div>
  );
}
