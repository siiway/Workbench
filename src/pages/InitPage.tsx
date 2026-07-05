import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Text,
  Body1,
  tokens,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { useI18n } from "../i18n";
import { AuthShell } from "../components/AuthShell";
import { PasswordInput } from "../components/PasswordInput";

type Props = { onComplete: () => void };

export function InitPage({ onComplete }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    prism_base_url: "",
    prism_client_id: "",
    prism_client_secret: "",
    prism_redirect_uri: `${window.location.origin}/callback`,
    glint_base_url: "",
    glint_client_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const usePkce = !form.prism_client_secret.trim();
      const res = await fetch("/api/init/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, use_pkce: usePkce }),
      });
      if (!res.ok) {
        const d: { error?: string } = await res.json();
        setError(d.error ?? t.initSetupFailed);
        return;
      }
      onComplete();
    } catch {
      setError(t.networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell maxWidth={480}>
      <form
        onSubmit={(e) => void submit(e)}
        style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}
      >
        <Text size={600} weight="bold">
          {t.initTitle}
        </Text>
        <Body1 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.initSubtitle}
        </Body1>

        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        <Field label={t.initFieldPrismBaseUrl} required>
          <Input
            placeholder="https://auth.example.com"
            value={form.prism_base_url}
            onChange={set("prism_base_url")}
            autoFocus
          />
        </Field>
        <Field label={t.initFieldPrismClientId} required>
          <Input
            placeholder="your-client-id"
            value={form.prism_client_id}
            onChange={set("prism_client_id")}
          />
        </Field>
        <Field
          label={t.initFieldPrismClientSecret}
          hint={t.initFieldPrismClientSecretHint}
        >
          <PasswordInput
            placeholder={t.initFieldPrismClientSecretHint}
            value={form.prism_client_secret}
            onChange={set("prism_client_secret")}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t.initFieldRedirectUri} required>
          <Input value={form.prism_redirect_uri} onChange={set("prism_redirect_uri")} />
        </Field>
        <Field
          label={t.initFieldGlintBaseUrl}
          hint={t.initFieldGlintBaseUrlHint}
        >
          <Input
            placeholder="https://glint.example.com"
            value={form.glint_base_url}
            onChange={set("glint_base_url")}
          />
        </Field>
        <Field
          label={t.initFieldGlintClientId}
          hint={t.initFieldGlintClientIdHint}
        >
          <Input
            placeholder="prism_xxxxxxxxxxxx"
            value={form.glint_client_id}
            onChange={set("glint_client_id")}
          />
        </Field>

        <Button type="submit" appearance="primary" disabled={saving}>
          {saving ? t.saving : t.initSaveContinue}
        </Button>
      </form>
    </AuthShell>
  );
}
