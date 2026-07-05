import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
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
    padding: "32px",
    maxWidth: "1080px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
    height: "100%",
    overflowY: "auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    cursor: "pointer",
    transition: "box-shadow 0.15s",
    ":hover": { boxShadow: tokens.shadow8 },
  },
  cardActive: {
    boxShadow: tokens.shadow4,
    border: `1px solid ${tokens.colorBrandStroke1}`,
  },
  cardBody: {
    padding: "0 16px 16px",
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
        <Card>
          <EmptyState
            icon={<PeopleRegular />}
            title={t.teamsEmpty}
          />
        </Card>
      ) : (
        <div className={styles.grid}>
          {teams.map((team) => {
            const active = team.id === activeTeamId;
            return (
              <Card
                key={team.id}
                className={`${styles.card} ${active ? styles.cardActive : ""}`}
                onClick={() => handlePick(team.id)}
              >
                <CardHeader
                  image={
                    <Avatar
                      name={team.name}
                      image={team.avatarUrl ? { src: team.avatarUrl } : undefined}
                      size={40}
                      shape="square"
                    />
                  }
                  header={<Text weight="semibold">{team.name}</Text>}
                  description={
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {team.id.slice(0, 12)}…
                    </Text>
                  }
                />
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
