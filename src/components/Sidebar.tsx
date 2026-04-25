import {
  makeStyles,
  tokens,
  Title3,
  Caption1,
  Caption2,
  Body2,
  Button,
  Avatar,
  Divider,
  Badge,
  mergeClasses,
} from "@fluentui/react-components";
import {
  GridDots20Regular,
  SignOut20Regular,
  Settings20Regular,
  Settings20Filled,
  Home20Regular,
  Home20Filled,
  CheckboxChecked20Regular,
  CheckboxChecked20Filled,
  People20Regular,
  People20Filled,
} from "@fluentui/react-icons";
import { NavLink } from "react-router-dom";
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
    width: "240px",
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
  nav: {
    flex: 1,
    overflowY: "auto",
    padding: tokens.spacingVerticalS,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `8px ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    textAlign: "left",
    width: "100%",
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase300,
    boxSizing: "border-box",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground1,
    },
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
  },
  navItemLabel: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  teamSummary: {
    margin: `0 ${tokens.spacingHorizontalS}`,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  teamSummaryRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  teamSummaryName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  teamEmpty: {
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    padding: tokens.spacingVerticalS,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
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
};

export function Sidebar({ teams, activeTeamId }: Props) {
  const styles = useStyles();
  const { user, logout } = useAuth();

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const userRole = activeTeam?.role;

  function NavItem({
    to,
    end,
    label,
    icon,
    activeIcon,
  }: {
    to: string;
    end?: boolean;
    label: string;
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
  }) {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          mergeClasses(styles.navItem, isActive && styles.navItemActive)
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? activeIcon : icon}
            <Caption1 className={styles.navItemLabel}>{label}</Caption1>
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <GridDots20Regular />
        <Title3>Workbench</Title3>
      </div>
      <Divider />

      <nav className={styles.nav}>
        <NavItem to="/" end label="Overview" icon={<Home20Regular />} activeIcon={<Home20Filled />} />
        <NavItem to="/tasks" label="Tasks" icon={<CheckboxChecked20Regular />} activeIcon={<CheckboxChecked20Filled />} />
        <NavItem
          to="/teams"
          label="Teams"
          icon={<People20Regular />}
          activeIcon={<People20Filled />}
        />
        <NavItem
          to="/settings"
          label="Settings"
          icon={<Settings20Regular />}
          activeIcon={<Settings20Filled />}
        />
      </nav>

      <Divider />

      <div className={styles.footer}>
        <Caption2 style={{ color: tokens.colorNeutralForeground3, padding: `0 ${tokens.spacingHorizontalM}` }}>
          ACTIVE TEAM
        </Caption2>
        <div className={styles.teamSummary}>
          {activeTeam ? (
            <>
              <div className={styles.teamSummaryRow}>
                <Avatar
                  name={activeTeam.name}
                  image={activeTeam.avatarUrl ? { src: activeTeam.avatarUrl } : undefined}
                  size={20}
                  shape="square"
                />
                <Body2 className={styles.teamSummaryName}>{activeTeam.name}</Body2>
              </div>
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
            </>
          ) : (
            <Caption1 className={styles.teamEmpty}>
              {teams.length === 0 ? "No teams" : "No team selected"}
            </Caption1>
          )}
        </div>

        <Divider />

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
            {user?.username && user?.displayName && (
              <Caption1 style={{ color: tokens.colorNeutralForeground3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                @{user.username}
              </Caption1>
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
