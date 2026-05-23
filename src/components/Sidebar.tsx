// App shell sidebar — modeled on Prism's Layout pattern.

import {
  Avatar,
  Badge,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  HomeRegular,
  PeopleRegular,
  SettingsRegular,
  SignOutRegular,
  ShieldRegular,
  GlobeRegular,
  AppsRegular,
  WindowConsoleRegular,
  BranchForkRegular,
} from "@fluentui/react-icons";
import { NavLink, useNavigate } from "react-router-dom";
import type { TeamInfo, TeamRole } from "../types";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";

const ROLE_COLORS: Record<TeamRole, "brand" | "success" | "informative" | "subtle"> = {
  owner: "success",
  "co-owner": "informative",
  admin: "informative",
  member: "subtle",
};

const useStyles = makeStyles({
  sidebar: {
    width: "240px",
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground2,
    flexShrink: 0,
    height: "100%",
  },
  logo: {
    padding: "20px 16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  nav: {
    flex: 1,
    overflowY: "auto",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "4px",
    textDecoration: "none",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    ":hover": {
      background: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground1,
    },
  },
  navItemActive: {
    background: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ":hover": { background: tokens.colorNeutralBackground3Hover },
  },
  teamArea: {
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  teamRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  teamName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userArea: {
    padding: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

type Props = {
  teams: TeamInfo[];
  activeTeamId: string;
};

interface NavItemProps {
  to: string;
  end?: boolean;
  icon: React.ReactElement;
  label: string;
}

function NavItem({ to, end, icon, label }: NavItemProps) {
  const styles = useStyles();
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${styles.navItem}${isActive ? ` ${styles.navItemActive}` : ""}`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function Sidebar({ teams, activeTeamId }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Text weight="semibold" size={400}>
          {t.appName}
        </Text>
      </div>

      <nav className={styles.nav}>
        <NavItem to="/" end icon={<HomeRegular />} label={t.navOverview} />
        <NavItem to="/tasks" icon={<CheckmarkCircleRegular />} label={t.navTasks} />
        <NavItem to="/apps" icon={<AppsRegular />} label={t.navApps} />
        <NavItem to="/console" icon={<WindowConsoleRegular />} label={t.navConsole} />
        <NavItem to="/bridge" icon={<BranchForkRegular />} label={t.navBridge} />
        <NavItem to="/permissions" icon={<ShieldRegular />} label={t.navPermissions} />
      </nav>

      {activeTeam && (
        <div className={styles.teamArea}>
          <Text
            size={200}
            style={{
              color: tokens.colorNeutralForeground3,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              fontWeight: tokens.fontWeightSemibold,
            }}
          >
            {t.activeTeam}
          </Text>
          <div className={styles.teamRow}>
            <Avatar
              name={activeTeam.name}
              image={activeTeam.avatarUrl ? { src: activeTeam.avatarUrl } : undefined}
              size={24}
              shape="square"
            />
            <Text className={styles.teamName} size={300} weight="semibold">
              {activeTeam.name}
            </Text>
          </div>
          <Badge
            appearance="filled"
            size="small"
            color={ROLE_COLORS[activeTeam.role]}
            style={{ alignSelf: "flex-start" }}
          >
            {activeTeam.role}
          </Badge>
        </div>
      )}

      <div className={styles.userArea}>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton
              appearance="subtle"
              style={{ width: "100%", justifyContent: "flex-start", gap: 8 }}
              icon={
                <Avatar
                  name={user?.displayName || user?.username}
                  image={user?.avatarUrl ? { src: user.avatarUrl } : undefined}
                  size={28}
                />
              }
            >
              <div style={{ textAlign: "left", overflow: "hidden" }}>
                <Text
                  block
                  size={200}
                  weight="semibold"
                  truncate
                  style={{ maxWidth: 140 }}
                >
                  {user?.displayName || user?.username}
                </Text>
                <Text
                  block
                  size={100}
                  truncate
                  style={{ color: tokens.colorNeutralForeground3, maxWidth: 140 }}
                >
                  @{user?.username}
                </Text>
              </div>
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                icon={<PeopleRegular />}
                onClick={() => navigate("/teams")}
              >
                {t.switchTeam}
              </MenuItem>
              <MenuItem
                icon={<SettingsRegular />}
                onClick={() => navigate("/settings")}
              >
                {t.settings}
              </MenuItem>
              <MenuItem
                icon={<GlobeRegular />}
                onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              >
                {locale === "en" ? t.langChinese : t.langEnglish}
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<SignOutRegular />} onClick={() => void logout()}>
                {t.signOut}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </aside>
  );
}
