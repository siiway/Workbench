import { useState, useEffect } from "react";
import {
  Button,
  Field,
  Input,
  Title2,
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
import { KeybindsSettings } from "../components/KeybindsSettings";
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
  const [form, setForm] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setForm(d as GlobalConfig))
      .catch(() => setError("Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

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
        setError(d.error ?? "Save failed");
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading…" />;
  if (!form) return <MessageBar intent="error"><MessageBarBody>{error || "Failed to load."}</MessageBarBody></MessageBar>;

  return (
    <form className={styles.body} onSubmit={(e) => void save(e)}>
      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>Read-only — only team owners and co-owners can modify global settings.</MessageBarBody>
        </MessageBar>
      )}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success"><MessageBarBody>Settings saved.</MessageBarBody></MessageBar>}

      <div className={styles.section}>
        <Subtitle2>Prism Identity Provider</Subtitle2>
        <Divider />
        <Field label="Base URL">
          <Input value={form.prism_base_url} onChange={set("prism_base_url")} disabled={!canEdit} />
        </Field>
        <Field label="Client ID">
          <Input value={form.prism_client_id} onChange={set("prism_client_id")} disabled={!canEdit} />
        </Field>
        <Field label="Client Secret" hint="Leave blank to use PKCE. Shows masked if a secret is stored.">
          <Input
            type="password"
            placeholder={form.use_pkce ? "Not set — using PKCE" : "Enter new secret to change"}
            value={form.prism_client_secret}
            onChange={set("prism_client_secret")}
            disabled={!canEdit}
            contentBefore={form.use_pkce ? undefined : <LockClosed20Regular />}
          />
        </Field>
        <Field label="Redirect URI">
          <Input value={form.prism_redirect_uri} onChange={set("prism_redirect_uri")} disabled={!canEdit} />
        </Field>
        <div className={styles.readonlyNote}>
          <Caption1>Auth mode:</Caption1>
          <Badge appearance="tint" color={form.use_pkce ? "success" : "informative"}>
            {form.use_pkce ? "PKCE" : "Client Secret"}
          </Badge>
        </div>
      </div>

      <div className={styles.section}>
        <Subtitle2>Default Glint Instance</Subtitle2>
        <Divider />
        <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
          Used for teams that don't have a team-specific Glint URL configured.
        </Body2>
        <Field label="Default Glint Base URL">
          <Input
            placeholder="https://glint.example.com"
            value={form.glint_base_url}
            onChange={set("glint_base_url")}
            disabled={!canEdit}
          />
        </Field>
        <Field
          label="Glint Prism client ID"
          hint="Glint's client_id in Prism. Required for Workbench to request app:<id>:<scope> cross-app scopes during OAuth. Leave empty if Glint is colocated with this Workbench (uses /api/workbench/* fallback)."
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
        <Subtitle2>Session</Subtitle2>
        <Divider />
        <Field label="Session TTL (seconds)" hint="0 = use token expiry. Minimum: 86400 (24 h).">
          <Input
            type="number"
            value={String(form.session_ttl)}
            onChange={(e) => setForm((f) => f ? { ...f, session_ttl: Number(e.target.value) } : f)}
            disabled={!canEdit}
          />
        </Field>
        <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
          Changes take effect on next login. Existing sessions are not affected.
        </Body2>
      </div>

      {canEdit && (
        <div className={styles.actions}>
          <Button type="submit" appearance="primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
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
      .catch(() => setError("Failed to load team settings."));
  }, [activeTeamId, configs]);

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
        setError(d.error ?? "Save failed");
        return;
      }
      setSuccess(activeTeamId);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (teams.length === 0) {
    return <Body2 style={{ color: tokens.colorNeutralForeground3 }}>No teams available.</Body2>;
  }

  return (
    <form className={styles.body} onSubmit={(e) => void save(e)}>
      {/* Team selector */}
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
      {success === activeTeamId && <MessageBar intent="success"><MessageBarBody>Team settings saved.</MessageBarBody></MessageBar>}

      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>Read-only — only owners and co-owners of this team can edit its settings.</MessageBarBody>
        </MessageBar>
      )}

      {configs[activeTeamId] === undefined ? (
        <Spinner label="Loading…" />
      ) : (
        <div className={styles.section}>
          <Subtitle2>Glint Instance</Subtitle2>
          <Divider />
          <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
            Overrides the global default Glint URL for this team only.
          </Body2>
          <Field label="Glint Base URL" hint="Leave blank to use the global default.">
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
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const styles = useStyles();
  const { user } = useAuth();
  const [tab, setTab] = useState<"global" | "team" | "keybinds">("global");

  const canEditGlobal = user?.teams.some(
    (t) => t.role === "owner" || t.role === "co-owner",
  ) ?? false;

  return (
    <div className={styles.root}>
      <Title2>Settings</Title2>
      <TabList
        selectedValue={tab}
        onTabSelect={(_, d: SelectTabData) =>
          setTab(d.value as "global" | "team" | "keybinds")
        }
      >
        <Tab value="global">Global</Tab>
        <Tab value="team">Teams</Tab>
        <Tab value="keybinds">Keybinds</Tab>
      </TabList>

      {tab === "global" && <GlobalSettings canEdit={canEditGlobal} />}
      {tab === "team" && <TeamSettings teams={user?.teams ?? []} />}
      {tab === "keybinds" && <KeybindsSettings />}
    </div>
  );
}
