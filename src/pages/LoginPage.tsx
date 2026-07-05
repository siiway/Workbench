import {
  Body1,
  Button,
  Text,
  tokens,
} from "@fluentui/react-components";
import { GridDots24Regular } from "@fluentui/react-icons";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { AuthShell } from "../components/AuthShell";

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();

  return (
    <AuthShell>
      <GridDots24Regular
        style={{
          fontSize: 48,
          color: tokens.colorBrandForeground1,
          textAlign: "center",
        }}
      />
      <Text size={800} weight="bold" style={{ textAlign: "center" }}>
        {t.loginTitle}
      </Text>
      <Body1 style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
        {t.loginSubtitle}
      </Body1>
      <Button appearance="primary" size="large" onClick={() => void login()}>
        {t.loginButton}
      </Button>
    </AuthShell>
  );
}
