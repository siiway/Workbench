import { Button, Title2, Body1, Image, makeStyles, tokens } from "@fluentui/react-components";
import { useAuth } from "../auth";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: tokens.spacingVerticalXL,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: "320px",
    boxShadow: tokens.shadow8,
  },
});

export function LoginPage() {
  const { login } = useAuth();
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <Image src="/favicon.svg" width={48} height={48} alt="Workbench" />
        <Title2>Siiway Workbench</Title2>
        <Body1>Sign in to access your team workbench.</Body1>
        <Button appearance="primary" size="large" onClick={() => void login()}>
          Sign in with Prism
        </Button>
      </div>
    </div>
  );
}
