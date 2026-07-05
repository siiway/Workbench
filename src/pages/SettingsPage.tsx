import { useState, useEffect } from "react";
import {
  Button,
  Field,
  Input,
  Subtitle2,
  Body2,
  Caption1,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  Divider,
  Badge,
  Spinner,
  Tab,
  TabList,
} from "@fluentui/react-components";
import type { SelectTabData } from "@fluentui/react-components";
import { LockClosed20Regular } from "@fluentui/react-icons";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { KeybindsSettings } from "../components/KeybindsSettings";
import { PageHeader } from "../components/PageHeader";
import { PasswordInput } from "../components/PasswordInput";
import type { TeamInfo } from "../types";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    overflowY: "auto",
    height: "100%",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "600px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  readonlyNote: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
  },
});

// ─── Global settings tab ────────────────────────────────────────────────────

type GlobalConfig = {
  prism_base_url: string;
  prism_client_id: string;
  prism_client_secret: string;
  prism_redirect_uri: string;
  glint_base_url: string;
  glint_client_id: string;
  use_pkce: boolean;
  session_ttl: number;
};

function GlobalSettings({ canEdit }: { canEdit: boolean }) {
  const styles = useStyles();
  const { t } = useI18n();
  const [form, setForm] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setForm(d as GlobalConfig))
      .catch(() => setError(t.settingsFailedToLoad))
      .finally(() => setLoading(false));
  }, [t.settingsFailedToLoad]);

  const set = (k: keyof GlobalConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => f ? { ...f, [k]: e.target.value } : f);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d: { error?: string } = await res.json();
        setError(d.error ?? t.saveFailed);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(t.networkError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label={t.loading} />;
  if (!form) return <MessageBar intent="error"><MessageBarBody>{error || t.settingsFailedToLoad}</MessageBarBody></MessageBar>;

  return (
    <form className={styles.body} onSubmit={(e) => void save(e)}>
      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>{t.settingsReadOnlyGlobal}</MessageBarBody>
        </MessageBar>
      )}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success"><MessageBarBody>{t.settingsSaved}</MessageBarBody></MessageBar>}

      <div className={styles.section}>
        <Subtitle2>{t.settingsPrismIdp}</Subtitle2>
        <Divider />
        <Field label={t.settingsFieldBaseUrl}>
          <Input value={form.prism_base_url} onChange={set("prism_base_url")} disabled={!canEdit} />
        </Field>
        <Field label={t.settingsFieldClientId}>
          <Input value={form.prism_client_id} onChange={set("prism_client_id")} disabled={!canEdit} />
        </Field>
        <Field label={t.settingsFieldClientSecret} hint={t.settingsFieldClientSecretHint}>
          <PasswordInput
            placeholder={form.use_pkce ? t.settingsSecretNotSet : t.settingsSecretChange}
            value={form.prism_client_secret}
            onChange={set("prism_client_secret")}
            disabled={!canEdit}
            autoComplete="current-password"
            contentBefore={form.use_pkce ? undefined : <LockClosed20Regular />}
          />
        </Field>
        <Field label={t.settingsFieldRedirectUri}>
          <Input value={form.prism_redirect_uri} onChange={set("prism_redirect_uri")} disabled={!canEdit} />
        </Field>
        <div className={styles.readonlyNote}>
          <Caption1>{t.settingsAuthMode}</Caption1>
          <Badge appearance="tint" color={form.use_pkce ? "success" : "informative"}>
            {form.use_pkce ? "PKCE" : "Client Secret"}
          </Badge>
        </div>
      </div>

      <div className={styles.section}>
        <Subtitle2>{t.settingsDefaultGlint}</Subtitle2>
        <Divider />
        <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.settingsDefaultGlintHint}
        </Body2>
        <Field label={t.settingsFieldDefaultGlintUrl}>
          <Input
            placeholder="https://glint.example.com"
            value={form.glint_base_url}
            onChange={set("glint_base_url")}
            disabled={!canEdit}
          />
        </Field>
        <Field
          label={t.settingsFieldGlintClientId}
          hint={t.settingsFieldGlintClientIdHint}
        >
          <Input
            placeholder="prism_xxxxxxxxxxxx"
            value={form.glint_client_id}
            onChange={set("glint_client_id")}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <div className={styles.section}>
        <Subtitle2>{t.settingsSession}</Subtitle2>
        <Divider />
        <Field label={t.settingsFieldSessionTtl} hint={t.settingsFieldSessionTtlHint}>
          <Input
            type="number"
            value={String(form.session_ttl)}
            onChange={(e) => setForm((f) => f ? { ...f, session_ttl: Number(e.target.value) } : f)}
            disabled={!canEdit}
          />
        </Field>
        <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
          {t.settingsSessionTtlNote}
        </Body2>
      </div>

      {canEdit && (
        <div className={styles.actions}>
          <Button type="submit" appearance="primary" disabled={saving}>
            {saving ? t.saving : t.saveChanges}
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── Team settings tab ───────────────────────────────────────────────────────

type TeamConfig = { glint_base_url: string };

function TeamSettings({ teams }: { teams: TeamInfo[] }) {
  const styles = useStyles();
  const { t } = useI18n();
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? "");
  const [configs, setConfigs] = useState<Record<string, TeamConfig>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const canEdit = activeTeam?.role === "owner" || activeTeam?.role === "co-owner";
  const form = configs[activeTeamId] ?? { glint_base_url: "" };

  useEffect(() => {
    if (!activeTeamId || configs[activeTeamId] !== undefined) return;
    fetch(`/api/teams/${activeTeamId}/settings`)
      .then((r) => r.json())
      .then((d) => setConfigs((prev) => ({ ...prev, [activeTeamId]: d as TeamConfig })))
      .catch(() => setError(t.settingsFailedToLoad));
  }, [activeTeamId, configs, t.settingsFailedToLoad]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/teams/${activeTeamId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d: { error?: string } = await res.json();
        setError(d.error ?? t.saveFailed);
        return;
      }
      setSuccess(activeTeamId);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError(t.networkError);
    } finally {
      setSaving(false);
    }
  }

  if (teams.length === 0) {
    return <Body2 style={{ color: tokens.colorNeutralForeground3 }}>{t.settingsNoTeams}</Body2>;
  }

  return (
    <form className={styles.body} onSubmit={(e) => void save(e)}>
      <TabList
        selectedValue={activeTeamId}
        onTabSelect={(_, d: SelectTabData) => {
          setActiveTeamId(d.value as string);
          setError("");
          setSuccess("");
        }}
      >
        {teams.map((t) => (
          <Tab key={t.id} value={t.id}>{t.name}</Tab>
        ))}
      </TabList>

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success === activeTeamId && <MessageBar intent="success"><MessageBarBody>{t.settingsTeamSaved}</MessageBarBody></MessageBar>}

      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>{t.settingsReadOnlyTeam}</MessageBarBody>
        </MessageBar>
      )}

      {configs[activeTeamId] === undefined ? (
        <Spinner label={t.loading} />
      ) : (
        <div className={styles.section}>
          <Subtitle2>{t.settingsTeamGlintInstance}</Subtitle2>
          <Divider />
          <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
            {t.settingsTeamGlintHint}
          </Body2>
          <Field label={t.settingsTeamGlintUrl} hint={t.settingsTeamGlintUrlHint}>
            <Input
              placeholder="https://glint.example.com"
              value={form.glint_base_url}
              onChange={(e) =>
                setConfigs((prev) => ({
                  ...prev,
                  [activeTeamId]: { ...form, glint_base_url: e.target.value },
                }))
              }
              disabled={!canEdit}
            />
          </Field>
        </div>
      )}

      {canEdit && configs[activeTeamId] !== undefined && (
        <div className={styles.actions}>
          <Button type="submit" appearance="primary" disabled={saving}>
            {saving ? t.saving : t.saveChanges}
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const styles = useStyles();
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<"global" | "team" | "keybinds">("global");

  const canEditGlobal = user?.teams.some(
    (t) => t.role === "owner" || t.role === "co-owner",
  ) ?? false;

  return (
    <div className={styles.root}>
      <PageHeader title={t.settingsTitle} />
      <TabList
        selectedValue={tab}
        onTabSelect={(_, d: SelectTabData) =>
          setTab(d.value as "global" | "team" | "keybinds")
        }
      >
        <Tab value="global">{t.settingsTabGlobal}</Tab>
        <Tab value="team">{t.settingsTabTeams}</Tab>
        <Tab value="keybinds">{t.settingsTabKeybinds}</Tab>
      </TabList>

      {tab === "global" && <GlobalSettings canEdit={canEditGlobal} />}
      {tab === "team" && <TeamSettings teams={user?.teams ?? []} />}
      {tab === "keybinds" && <KeybindsSettings />}
    </div>
  );
}
