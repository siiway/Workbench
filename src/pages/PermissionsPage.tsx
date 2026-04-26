import { useEffect, useState, useMemo } from "react";
import {
  Body1,
  Button,
  Caption1,
  Checkbox,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowResetRegular, SaveRegular } from "@fluentui/react-icons";
import { PERMISSION_KEYS, type PermissionKey, type TeamRole } from "../types";
import { useI18n } from "../i18n";

type EditableRole = "admin" | "member";

const EDITABLE_ROLES: EditableRole[] = ["admin", "member"];

type PermResponse = {
  keys: readonly PermissionKey[];
  defaults: Record<EditableRole | "co-owner", Record<PermissionKey, boolean>>;
  global: Record<EditableRole, Record<PermissionKey, boolean>>;
  sets: Record<string, Record<EditableRole, Record<PermissionKey, boolean>>>;
  role: TeamRole;
  error?: string;
};

const useStyles = makeStyles({
  page: {
    padding: "24px 32px",
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
    maxWidth: "960px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "16px",
    paddingBottom: "16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: "20px",
  },
  matrix: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase300,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  thRole: {
    textAlign: "center",
    width: "120px",
  },
  td: {
    padding: "8px 12px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  tdRole: {
    textAlign: "center",
  },
  permName: {
    fontFamily:
      "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "12.5px",
  },
  defaultMark: {
    color: tokens.colorNeutralForeground4,
    fontSize: "11px",
    marginLeft: "6px",
  },
  actions: {
    display: "flex",
    gap: "8px",
  },
});

type Props = { teamId: string };

export function PermissionsPage({ teamId }: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const [data, setData] = useState<PermResponse | null>(null);
  const [draft, setDraft] = useState<
    Record<EditableRole, Record<PermissionKey, boolean>> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/glint/workbench/teams/${teamId}/permissions`,
      );
      const text = await res.text();
      let parsed: PermResponse;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError(`Unexpected response (${res.status}): ${text.slice(0, 300)}`);
        return;
      }
      if (!res.ok) {
        setError(parsed.error ?? `Error ${res.status}`);
        return;
      }
      setData(parsed);
      // Resolve effective globals: row exists → use it; else fall back to defaults.
      const effective: Record<EditableRole, Record<PermissionKey, boolean>> = {
        admin: { ...parsed.defaults.admin },
        member: { ...parsed.defaults.member },
      };
      for (const role of EDITABLE_ROLES) {
        const row = parsed.global?.[role] ?? {};
        for (const k of parsed.keys) {
          if (k in row) effective[role][k] = row[k];
        }
      }
      setDraft(effective);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = useMemo(() => {
    if (!data) return false;
    return data.role === "owner" || data.role === "co-owner" || data.role === "admin";
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    for (const role of EDITABLE_ROLES) {
      for (const k of data.keys) {
        const baseline = data.defaults[role][k];
        const stored = data.global?.[role]?.[k];
        const effectiveOriginal = stored !== undefined ? stored : baseline;
        if (draft[role][k] !== effectiveOriginal) return true;
      }
    }
    return false;
  }, [data, draft]);

  const toggle = (role: EditableRole, key: PermissionKey) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [role]: { ...draft[role], [key]: !draft[role][key] },
    });
  };

  const save = async () => {
    if (!data || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const rows: { role: EditableRole; permission: PermissionKey; allowed: boolean }[] = [];
      for (const role of EDITABLE_ROLES) {
        for (const k of data.keys) {
          rows.push({ role, permission: k, allowed: draft[role][k] });
        }
      }
      const res = await fetch(
        `/api/glint/workbench/teams/${teamId}/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "global", permissions: rows }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(`Save failed (${res.status}): ${text.slice(0, 300)}`);
        return;
      }
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/glint/workbench/teams/${teamId}/permissions?scope=global`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(`Reset failed (${res.status}): ${text.slice(0, 300)}`);
        return;
      }
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Spinner label={t.permLoading} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.page}>
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (!data || !draft) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Title2>{t.permissionsTitle}</Title2>
          <Caption1
            block
            style={{ color: tokens.colorNeutralForeground3, marginTop: 4 }}
          >
            {t.permissionsSubtitle}
          </Caption1>
        </div>
        <div className={styles.actions}>
          <Button
            appearance="subtle"
            icon={<ArrowResetRegular />}
            onClick={() => void resetToDefaults()}
            disabled={!canEdit || saving}
          >
            {t.permReset}
          </Button>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={() => void save()}
            disabled={!canEdit || !dirty || saving}
          >
            {t.permSave}
          </Button>
        </div>
      </header>

      {!canEdit && (
        <MessageBar intent="info" style={{ marginBottom: 16 }}>
          <MessageBarBody>{t.permReadOnly}</MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error" style={{ marginBottom: 16 }}>
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {savedAt && !error && (
        <Body1 style={{ color: tokens.colorPaletteGreenForeground1, marginBottom: 12 }}>
          {t.permSaved}
        </Body1>
      )}

      <Subtitle1 block style={{ marginBottom: 8 }}>
        {t.permGlobal}
      </Subtitle1>

      <table className={styles.matrix}>
        <thead>
          <tr>
            <th className={styles.th}>{t.permColPermission}</th>
            <th className={`${styles.th} ${styles.thRole}`}>{t.permColAdmin}</th>
            <th className={`${styles.th} ${styles.thRole}`}>{t.permColMember}</th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_KEYS.map((key) => (
            <tr key={key}>
              <td className={styles.td}>
                <span className={styles.permName}>{key}</span>
              </td>
              {EDITABLE_ROLES.map((role) => {
                const checked = draft[role][key];
                const isDefault = data.defaults[role][key] === checked;
                return (
                  <td
                    key={role}
                    className={`${styles.td} ${styles.tdRole}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canEdit}
                      onChange={() => toggle(role, key)}
                    />
                    {!isDefault && (
                      <span className={styles.defaultMark}>{t.permCustom}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
