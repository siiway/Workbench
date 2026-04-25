import {
  Title2,
  Body2,
  Body1,
  Caption1,
  Avatar,
  Badge,
  Card,
  Button,
  makeStyles,
  tokens,
  mergeClasses,
} from "@fluentui/react-components";
import { Checkmark16Filled } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import type { TeamInfo, TeamRole } from "../types";

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  "co-owner": "Co-owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_COLOR: Record<TeamRole, "success" | "informative" | "warning" | "subtle"> = {
  owner: "success",
  "co-owner": "warning",
  admin: "warning",
  member: "subtle",
};

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    overflowY: "auto",
    height: "100%",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: tokens.spacingVerticalM,
  },
  card: {
    cursor: "pointer",
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    transitionProperty: "background-color, border-color",
    transitionDuration: "0.12s",
    ":hover": {
      borderTopColor: tokens.colorBrandStroke1,
      borderRightColor: tokens.colorBrandStroke1,
      borderBottomColor: tokens.colorBrandStroke1,
      borderLeftColor: tokens.colorBrandStroke1,
    },
  },
  cardActive: {
    backgroundColor: tokens.colorBrandBackground2,
    borderTopColor: tokens.colorBrandStroke1,
    borderRightColor: tokens.colorBrandStroke1,
    borderBottomColor: tokens.colorBrandStroke1,
    borderLeftColor: tokens.colorBrandStroke1,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  cardName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardFoot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
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

  const handlePick = (id: string) => {
    onTeamChange(id);
    navigate("/");
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Teams</Title2>
        <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
          Pick a team to load its tasks and overview.
        </Body2>
      </div>

      {teams.length === 0 ? (
        <Card>
          <div className={styles.empty}>
            <Body1>You don't belong to any teams yet.</Body1>
          </div>
        </Card>
      ) : (
        <div className={styles.grid}>
          {teams.map((team) => {
            const active = team.id === activeTeamId;
            return (
              <Card
                key={team.id}
                className={mergeClasses(styles.card, active && styles.cardActive)}
                onClick={() => handlePick(team.id)}
              >
                <div className={styles.cardHead}>
                  <Avatar
                    name={team.name}
                    image={team.avatarUrl ? { src: team.avatarUrl } : undefined}
                    size={40}
                    shape="square"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Body1 className={styles.cardName} style={{ fontWeight: 600 }}>
                      {team.name}
                    </Body1>
                    <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                      {team.id}
                    </Caption1>
                  </div>
                </div>
                <div className={styles.cardFoot}>
                  <Badge appearance="tint" color={ROLE_COLOR[team.role]}>
                    {ROLE_LABEL[team.role]}
                  </Badge>
                  {active ? (
                    <Badge appearance="filled" color="brand" icon={<Checkmark16Filled />}>
                      Active
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
                      Switch to
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
