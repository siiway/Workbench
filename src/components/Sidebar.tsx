import {
  makeStyles,
  tokens,
  Title3,
  Caption1,
  Caption2,
  Button,
  Avatar,
  Divider,
  Badge,
} from "@fluentui/react-components";
import {
  GridDots20Regular,
  SignOut20Regular,
  Settings20Regular,
  Home20Regular,
  Home20Filled,
  CheckboxChecked20Regular,
  CheckboxChecked20Filled,
} from "@fluentui/react-icons";
import { useNavigate, useLocation } from "react-router-dom";
import type { TeamInfo, TeamRole } from "../types";
import { useAuth } from "../auth";

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
  sidebar: {
    width: "220px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  sectionLabel: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 2px`,
    color: tokens.colorNeutralForeground3,
    userSelect: "none",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `6px ${tokens.spacingHorizontalS}`,
    margin: `0 ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    textAlign: "left",
    width: "calc(100% - 8px)",
    color: tokens.colorNeutralForeground1,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    fontWeight: "600",
  },
  teamActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  itemLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: tokens.spacingVerticalS,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `6px ${tokens.spacingHorizontalS}`,
  },
  userInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    gap: "2px",
  },
  userName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

type Props = {
  teams: TeamInfo[];
  activeTeamId: string;
  onTeamChange: (id: string) => void;
};

export function Sidebar({ teams, activeTeamId, onTeamChange }: Props) {
  const styles = useStyles();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const userRole = activeTeam?.role;

  function navItem(
    path: string,
    label: string,
    icon: React.ReactNode,
    activeIcon: React.ReactNode,
  ) {
    const active = pathname === path;
    return (
      <button
        className={`${styles.item} ${active ? styles.itemActive : ""}`}
        onClick={() => navigate(path)}
      >
        {active ? activeIcon : icon}
        <Caption1 className={styles.itemLabel}>{label}</Caption1>
      </button>
    );
  }

  return (
    <div className={styles.sidebar}>
      {/* App header */}
      <div className={styles.header}>
        <GridDots20Regular />
        <Title3>Workbench</Title3>
      </div>
      <Divider />

      {/* Team switcher */}
      <Caption2 className={styles.sectionLabel}>TEAMS</Caption2>
      {teams.map((team) => (
        <button
          key={team.id}
          className={`${styles.item} ${team.id === activeTeamId ? styles.teamActive : ""}`}
          onClick={() => onTeamChange(team.id)}
        >
          <Avatar
            name={team.name}
            image={team.avatarUrl ? { src: team.avatarUrl } : undefined}
            size={20}
            shape="square"
          />
          <Caption1 className={styles.itemLabel}>{team.name}</Caption1>
        </button>
      ))}

      <Divider style={{ margin: `${tokens.spacingVerticalS} 0` }} />

      {/* Navigation */}
      <Caption2 className={styles.sectionLabel}>NAVIGATE</Caption2>
      {navItem("/", "Overview", <Home20Regular />, <Home20Filled />)}
      {navItem("/tasks", "Tasks", <CheckboxChecked20Regular />, <CheckboxChecked20Filled />)}

      <div style={{ flex: 1 }} />
      <Divider />

      {/* Bottom: settings + user */}
      <div className={styles.footer}>
        <button
          className={`${styles.item} ${pathname === "/settings" ? styles.itemActive : ""}`}
          onClick={() => navigate(pathname === "/settings" ? "/" : "/settings")}
        >
          <Settings20Regular />
          <Caption1 className={styles.itemLabel}>Settings</Caption1>
        </button>

        <div className={styles.userRow}>
          <Avatar
            name={user?.displayName || user?.username}
            image={user?.avatarUrl ? { src: user.avatarUrl } : undefined}
            size={28}
          />
          <div className={styles.userInfo}>
            <Caption1 className={styles.userName}>
              {user?.displayName || user?.username}
            </Caption1>
            {userRole && (
              <Badge
                appearance="tint"
                color={ROLE_COLOR[userRole]}
                size="small"
                style={{ alignSelf: "flex-start" }}
              >
                {ROLE_LABEL[userRole]}
              </Badge>
            )}
          </div>
          <Button
            appearance="subtle"
            icon={<SignOut20Regular />}
            size="small"
            title="Sign out"
            onClick={() => void logout()}
          />
        </div>
      </div>
    </div>
  );
}
