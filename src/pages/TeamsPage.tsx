import {
  Avatar,
  Badge,
  Button,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular, PeopleRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TeamInfo, TeamRole } from "../types";
import { useI18n } from "../i18n";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";

const ROLE_COLORS: Record<TeamRole, "brand" | "success" | "informative" | "subtle"> = {
  owner: "success",
  "co-owner": "informative",
  admin: "informative",
  member: "subtle",
};

const useStyles = makeStyles({
  root: {
    padding: "20px 24px",
    boxSizing: "border-box",
    height: "100%",
    overflowY: "auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
  },
  card: {
    cursor: "pointer",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    background: tokens.colorNeutralBackground1,
    overflow: "hidden",
    transition: "border-color 0.15s",
    ":hover": {
      borderTopColor: tokens.colorNeutralForeground1,
      borderRightColor: tokens.colorNeutralForeground1,
      borderBottomColor: tokens.colorNeutralForeground1,
      borderLeftColor: tokens.colorNeutralForeground1,
    },
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px 0",
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: 1,
  },
  cardActive: {
    borderTopColor: tokens.colorBrandStroke1,
    borderRightColor: tokens.colorBrandStroke1,
    borderBottomColor: tokens.colorBrandStroke1,
    borderLeftColor: tokens.colorBrandStroke1,
  },
  cardBody: {
    padding: "12px 16px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
});

type Props = {
  teams: TeamInfo[];
  activeTeamId: string;
  onTeamChange: (id: string) => void;
};

export function TeamsPage({ teams, activeTeamId, onTeamChange }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { t } = useI18n();

  const handlePick = (id: string) => {
    onTeamChange(id);
    navigate("/");
  };

  return (
    <div className={styles.root}>
      <PageHeader title={t.teamsTitle} subtitle={t.teamsSubtitle} />

      {teams.length === 0 ? (
        <div className={styles.card} style={{ padding: "16px" }}>
          <EmptyState
            icon={<PeopleRegular />}
            title={t.teamsEmpty}
          />
        </div>
      ) : (
        <div className={styles.grid}>
          {teams.map((team) => {
            const active = team.id === activeTeamId;
            return (
              <div
                key={team.id}
                className={`${styles.card} ${active ? styles.cardActive : ""}`}
                onClick={() => handlePick(team.id)}
              >
                <div className={styles.cardHead}>
                  <Avatar
                    name={team.name}
                    image={team.avatarUrl ? { src: team.avatarUrl } : undefined}
                    size={40}
                    shape="square"
                  />
                  <div className={styles.cardInfo}>
                    <Text weight="semibold">{team.name}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {team.id.slice(0, 12)}…
                    </Text>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <Badge appearance="filled" color={ROLE_COLORS[team.role]}>
                    {team.role}
                  </Badge>
                  {active ? (
                    <Badge appearance="tint" color="brand" icon={<CheckmarkRegular />}>
                      {t.teamsActive}
                    </Badge>
                  ) : (
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePick(team.id);
                      }}
                    >
                      {t.teamsSwitch}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
