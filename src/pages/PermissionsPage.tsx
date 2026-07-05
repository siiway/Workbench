import { useEffect, useState } from "react";
import {
  Body1,
  Body2,
  Caption1,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { PERMISSION_KEYS, type PermissionKey, type TeamRole } from "../types";
import { useI18n } from "../i18n";
import { PageHeader } from "../components/PageHeader";

type EditableRole = "admin" | "member";
const EDITABLE_ROLES: EditableRole[] = ["admin", "member"];

type PermissionsMe = {
  permissions: Record<PermissionKey, boolean>;
  role: TeamRole;
  error?: string;
};

type MatrixResponse = {
  keys: readonly PermissionKey[];
  defaults: Record<EditableRole | "co-owner", Record<PermissionKey, boolean>>;
  global: Record<EditableRole, Record<PermissionKey, boolean>>;
  sets: Record<string, Record<EditableRole, Record<PermissionKey, boolean>>>;
  role: TeamRole;
  error?: string;
};

const useStyles = makeStyles({
  pageScroll: {
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  },
  page: {
    padding: "24px 32px",
    boxSizing: "border-box",
    maxWidth: "960px",
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "14px 18px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  cardBody: {
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sectionLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  meList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "8px 16px",
  },
  meItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 0",
  },
  permName: {
    fontFamily:
      "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "12.5px",
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
  custom: {
    color: tokens.colorNeutralForeground4,
    fontSize: "11px",
    marginLeft: "6px",
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  tableScroll: {
    overflowX: "auto",
  },
});

type Props = { teamId: string };

export function PermissionsPage({ teamId }: Props) {
  const styles = useStyles();
  const { t } = useI18n();

  const [me, setMe] = useState<PermissionsMe | null>(null);
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load self perms (always) + matrix (only for owner/co-owner)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/glint/teams/${teamId}/permissions/me`)
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(parseError(text, r.status));
        return JSON.parse(text) as PermissionsMe;
      })
      .then(async (meData) => {
        if (cancelled) return;
        setMe(meData);
        if (meData.role === "owner" || meData.role === "co-owner") {
          const r = await fetch(`/api/glint/teams/${teamId}/permissions`);
          const text = await r.text();
          if (!cancelled) {
            if (r.ok) {
              setMatrix(JSON.parse(text) as MatrixResponse);
            } else {
              setError(parseError(text, r.status));
            }
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const isAdminish = me?.role === "owner" || me?.role === "co-owner";

  if (loading) {
    return (
      <div className={styles.pageScroll}>
        <div className={styles.page}>
          <Spinner label={t.permLoading} />
        </div>
      </div>
    );
  }

  if (error && !me) {
    return (
      <div className={styles.pageScroll}>
        <div className={styles.page}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  if (!me) return null;

  const grantedKeys = PERMISSION_KEYS.filter((k) => me.permissions[k]);
  const deniedKeys = PERMISSION_KEYS.filter((k) => !me.permissions[k]);

  return (
    <div className={styles.pageScroll}>
      <div className={styles.page}>
        <PageHeader
          title={t.permissionsTitle}
          subtitle={t.permissionsReadOnlyHint}
        />

      {error && (
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {/* Glint section */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <Subtitle1>Glint</Subtitle1>
        </div>
        <div className={styles.cardBody}>
          {/* Your permissions — visible to everyone */}
          <div>
            <Body2 className={styles.sectionLabel}>
              {t.permYourPermissions} ({me.role})
            </Body2>
            <Caption1
              block
              style={{ color: tokens.colorNeutralForeground3, marginBottom: 8 }}
            >
              {t.permYourPermissionsHint}
            </Caption1>
            {grantedKeys.length === 0 ? (
              <Body1 className={styles.hint}>{t.permYourPermissionsEmpty}</Body1>
            ) : (
              <div className={styles.meList}>
                {grantedKeys.map((k) => (
                  <div key={k} className={styles.meItem}>
                    <CheckmarkCircleRegular
                      fontSize={16}
                      color={tokens.colorPaletteGreenForeground1}
                    />
                    <span className={styles.permName}>{k}</span>
                  </div>
                ))}
              </div>
            )}
            {deniedKeys.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary
                  style={{
                    color: tokens.colorNeutralForeground3,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {t.permShowDenied(deniedKeys.length)}
                </summary>
                <div className={styles.meList} style={{ marginTop: 8 }}>
                  {deniedKeys.map((k) => (
                    <div key={k} className={styles.meItem}>
                      <DismissCircleRegular
                        fontSize={16}
                        color={tokens.colorNeutralForeground4}
                      />
                      <span
                        className={styles.permName}
                        style={{ color: tokens.colorNeutralForeground3 }}
                      >
                        {k}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Team config — only for owner / co-owner */}
          {isAdminish && matrix && (
            <div>
              <Body2 className={styles.sectionLabel}>
                {t.permTeamConfig}
              </Body2>
              <Caption1
                block
                style={{
                  color: tokens.colorNeutralForeground3,
                  marginBottom: 8,
                }}
              >
                {t.permTeamConfigHint}
              </Caption1>
              <div className={styles.tableScroll}>
                <table className={styles.matrix}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t.permColPermission}</th>
                      <th className={`${styles.th} ${styles.thRole}`}>
                        {t.permColAdmin}
                      </th>
                      <th className={`${styles.th} ${styles.thRole}`}>
                        {t.permColMember}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_KEYS.map((key) => (
                      <tr key={key}>
                        <td className={styles.td}>
                          <span className={styles.permName}>{key}</span>
                        </td>
                        {EDITABLE_ROLES.map((role) => {
                          const value =
                            matrix.global?.[role]?.[key] ??
                            matrix.defaults[role][key];
                          const isDefault =
                            matrix.global?.[role]?.[key] === undefined ||
                            matrix.defaults[role][key] === value;
                          return (
                            <td
                              key={role}
                              className={`${styles.td} ${styles.tdRole}`}
                            >
                              {value ? (
                                <CheckmarkCircleRegular
                                  fontSize={18}
                                  color={tokens.colorPaletteGreenForeground1}
                                />
                              ) : (
                                <DismissCircleRegular
                                  fontSize={18}
                                  color={tokens.colorNeutralForeground4}
                                />
                              )}
                              {!isDefault && (
                                <span className={styles.custom}>
                                  {t.permCustom}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

function parseError(text: string, status: number): string {
  try {
    const j = JSON.parse(text);
    return j.error ?? `${status}`;
  } catch {
    return `${status}: ${text.slice(0, 200)}`;
  }
}
