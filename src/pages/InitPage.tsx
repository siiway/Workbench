import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Title2,
  Body1,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: tokens.spacingVerticalXL,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    width: "100%",
    maxWidth: "480px",
    boxShadow: tokens.shadow8,
  },
});

type Props = { onComplete: () => void };

export function InitPage({ onComplete }: Props) {
  const styles = useStyles();
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
        setError(d.error ?? "Setup failed");
        return;
      }
      onComplete();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.root}>
      <form className={styles.card} onSubmit={(e) => void submit(e)}>
        <Title2>Setup Workbench</Title2>
        <Body1>Configure your Prism identity provider and Glint instance.</Body1>

        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        <Field label="Prism Base URL" required>
          <Input placeholder="https://auth.example.com" value={form.prism_base_url} onChange={set("prism_base_url")} />
        </Field>
        <Field label="Prism Client ID" required>
          <Input placeholder="your-client-id" value={form.prism_client_id} onChange={set("prism_client_id")} />
        </Field>
        <Field
          label="Prism Client Secret"
          hint="Leave blank to use PKCE instead of a client secret."
        >
          <Input type="password" placeholder="Leave blank to use PKCE" value={form.prism_client_secret} onChange={set("prism_client_secret")} />
        </Field>
        <Field label="Redirect URI" required>
          <Input value={form.prism_redirect_uri} onChange={set("prism_redirect_uri")} />
        </Field>
        <Field
          label="Default Glint Base URL"
          hint="Used for teams that don't have a team-specific Glint URL. Can be left blank and configured per-team later."
        >
          <Input placeholder="https://glint.example.com" value={form.glint_base_url} onChange={set("glint_base_url")} />
        </Field>
        <Field
          label="Glint Prism Client ID"
          hint="Glint's client_id in Prism. Required for Workbench to request app:<id>:<scope> cross-app scopes during OAuth. Can leave empty and configure later in Settings."
        >
          <Input placeholder="prism_xxxxxxxxxxxx" value={form.glint_client_id} onChange={set("glint_client_id")} />
        </Field>

        <Button type="submit" appearance="primary" disabled={saving}>
          {saving ? "Saving…" : "Save & Continue"}
        </Button>
      </form>
    </div>
  );
}
