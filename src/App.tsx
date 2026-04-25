import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
  Spinner,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
  Button,
} from "@fluentui/react-components";
import { AuthProvider, useAuth } from "./auth";
import { Sidebar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CallbackPage } from "./pages/CallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { InitPage } from "./pages/InitPage";
import type { TeamInfo } from "./types";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    height: "100%",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    overflow: "hidden",
  },
  center: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

function useColorScheme() {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
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
  const { user, loading, sessionExpired, login, dismissExpired } = useAuth();
  const { configured, markConfigured } = useInitStatus();
  const [activeTeamId, setActiveTeamId] = useState<string>("");

  // Pick first team as default when user loads
  useEffect(() => {
    if (user?.teams.length && !activeTeamId) {
      setActiveTeamId(user.teams[0].id);
    }
  }, [user, activeTeamId]);

  if (loading || configured === null) {
    return (
      <div className={styles.center}>
        <Spinner size="large" label="Loading…" />
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
    <div className={styles.shell}>
      <Sidebar
        teams={teams}
        activeTeamId={currentTeam}
        onTeamChange={setActiveTeamId}
      />
      <div className={styles.main}>
        {sessionExpired && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Session expired</MessageBarTitle>
              Your session has expired. Please sign in again.
            </MessageBarBody>
            <MessageBarActions
              containerAction={
                <Button appearance="primary" onClick={() => { dismissExpired(); void login(); }}>
                  Sign in
                </Button>
              }
            />
          </MessageBar>
        )}
        <div className={styles.content}>
          {currentTeam ? (
            <Routes>
              <Route path="/" element={<DashboardPage teamId={currentTeam} />} />
              <Route path="/tasks" element={<TasksPage teamId={currentTeam} />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
            <div className={styles.center}>
              <Spinner label="Loading teams…" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const dark = useColorScheme();

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme} style={{ height: "100%" }}>
      <AuthProvider>
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
      </AuthProvider>
    </FluentProvider>
  );
}
