import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  Spinner,
  makeStyles,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
  Button,
} from "@fluentui/react-components";
import { AuthProvider, useAuth } from "./auth";
import { I18nProvider, useI18n } from "./i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Sidebar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import { TeamsPage } from "./pages/TeamsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import { AppsPage } from "./pages/AppsPage";
import { ConsolePage } from "./pages/ConsolePage";
import { NextBridgePage } from "./pages/NextBridgePage";
import { NextBridgeConfigPage } from "./pages/NextBridgeConfigPage";
import { CallbackPage } from "./pages/CallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { InitPage } from "./pages/InitPage";
import { ConsoleProvider, useConsole } from "./console/ConsoleProvider";
import { ConsoleDrawer } from "./console/ConsoleDrawer";
import { commands } from "./console/commands";
import {
  KeybindProvider,
  useKeybindHandler,
} from "./keybinds/KeybindProvider";
import { useThemeStore, resolveDark } from "./store/theme";
import { patchTheme } from "./theme";
import type { TeamInfo } from "./types";

const ACTIVE_TEAM_KEY = "workbench:activeTeamId";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    minWidth: 0,
  },
  center: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

function useColorScheme() {
  const mode = useThemeStore((s) => s.mode);
  const [dark, setDark] = useState(() => resolveDark(mode));

  useEffect(() => {
    const isDark = resolveDark(mode);
    setDark(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setDark(e.matches);
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      document.documentElement.style.colorScheme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  return dark;
}

function useInitStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/init/status")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);
  return { configured, markConfigured: () => setConfigured(true) };
}

function AppShell() {
  const styles = useStyles();
  const { t } = useI18n();
  const { user, loading, sessionExpired, login, dismissExpired } = useAuth();
  const { configured, markConfigured } = useInitStatus();
  const [activeTeamId, setActiveTeamIdState] = useState<string>(
    () => localStorage.getItem(ACTIVE_TEAM_KEY) ?? "",
  );

  const setActiveTeamId = (id: string) => {
    setActiveTeamIdState(id);
    if (id) localStorage.setItem(ACTIVE_TEAM_KEY, id);
    else localStorage.removeItem(ACTIVE_TEAM_KEY);
  };

  // Reconcile active team against the user's actual teams.
  // If the stored team isn't a current team, fall back to the first one.
  useEffect(() => {
    if (!user) return;
    const teams = user.teams;
    if (!teams.length) {
      if (activeTeamId) setActiveTeamId("");
      return;
    }
    if (!activeTeamId || !teams.some((t) => t.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [user, activeTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || configured === null) {
    return (
      <div className={styles.center}>
        <Spinner size="large" label={t.loading} />
      </div>
    );
  }

  if (!configured) {
    return <InitPage onComplete={markConfigured} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const teams: TeamInfo[] = user.teams;
  const currentTeam = activeTeamId || teams[0]?.id || "";

  return (
    <KeybindProvider>
    <ConsoleProvider registry={commands}>
    <KeybindWiring />
    <div className={styles.shell}>
      <Sidebar teams={teams} activeTeamId={currentTeam} />
      <div className={styles.main}>
        {sessionExpired && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>{t.sessionExpiredTitle}</MessageBarTitle>
              {t.sessionExpiredBody}
            </MessageBarBody>
            <MessageBarActions
              containerAction={
                <Button appearance="primary" onClick={() => { dismissExpired(); void login(); }}>
                  {t.sessionExpiredSignIn}
                </Button>
              }
            />
          </MessageBar>
        )}
        <div className={styles.content}>
          <Routes>
            <Route
              path="/"
              element={
                currentTeam ? (
                  <DashboardPage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/tasks"
              element={
                currentTeam ? (
                  <TasksPage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/teams"
              element={
                <TeamsPage
                  teams={teams}
                  activeTeamId={currentTeam}
                  onTeamChange={setActiveTeamId}
                />
              }
            />
            <Route
              path="/apps"
              element={
                currentTeam ? (
                  <AppsPage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/console"
              element={
                currentTeam ? (
                  <ConsolePage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/permissions"
              element={
                currentTeam ? (
                  <PermissionsPage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/bridge"
              element={
                currentTeam ? (
                  <NextBridgePage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route
              path="/bridge/config"
              element={
                currentTeam ? (
                  <NextBridgeConfigPage teamId={currentTeam} />
                ) : (
                  <Navigate to="/teams" replace />
                )
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      {currentTeam && <ConsoleDrawer teamId={currentTeam} />}
    </div>
    </ConsoleProvider>
    </KeybindProvider>
  );
}

function KeybindWiring() {
  const navigate = useNavigate();
  const { drawerOpen, setDrawerOpen } = useConsole();
  useKeybindHandler("console.toggle", () => setDrawerOpen(!drawerOpen));
  useKeybindHandler("nav.overview", () => navigate("/"));
  useKeybindHandler("nav.tasks", () => navigate("/tasks"));
  useKeybindHandler("nav.apps", () => navigate("/apps"));
  useKeybindHandler("nav.permissions", () => navigate("/permissions"));
  useKeybindHandler("nav.bridge", () => navigate("/bridge"));
  return null;
}

export default function App() {
  const dark = useColorScheme();

  const theme = useMemo(() => {
    const base = dark ? webDarkTheme : webLightTheme;
    return patchTheme(base, dark);
  }, [dark]);

  return (
    <FluentProvider theme={theme} style={{ height: "100%" }}>
      <I18nProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/callback" element={<CallbackPage />} />
              <Route
                path="/login"
                element={
                  <div style={{ height: "100%" }}>
                    <LoginPage />
                  </div>
                }
              />
              <Route path="*" element={<AppShell />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </I18nProvider>
    </FluentProvider>
  );
}
