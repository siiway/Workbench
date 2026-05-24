import {
  Body1,
  Button,
  Card,
  CardHeader,
  Title1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { GridDots24Regular } from "@fluentui/react-icons";
import { useAuth } from "../auth";

const useStyles = makeStyles({
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
    padding: "24px",
  },
  card: {
    maxWidth: "400px",
    width: "100%",
    padding: "32px",
    textAlign: "center",
  },
  icon: {
    fontSize: "48px",
    color: tokens.colorBrandForeground1,
    marginBottom: "16px",
  },
  title: {
    marginBottom: "8px",
  },
  subtitle: {
    marginBottom: "24px",
    color: tokens.colorNeutralForeground3,
  },
});

export function LoginPage() {
  const styles = useStyles();
  const { login } = useAuth();

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader image={<GridDots24Regular className={styles.icon} />} />
        <Title1 className={styles.title}>SiiWay Workbench</Title1>
        <Body1 className={styles.subtitle}>
          Sign in to access your team workbench.
        </Body1>
        <Button appearance="primary" size="large" onClick={() => void login()}>
          Sign in with Prism
        </Button>
      </Card>
    </div>
  );
}
