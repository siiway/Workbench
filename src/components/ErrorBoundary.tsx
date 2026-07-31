import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
    gap: "16px",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
  },
  message: {
    fontSize: "14px",
    color: tokens.colorNeutralForeground2,
    maxWidth: "480px",
    textAlign: "center",
  },
});

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React error boundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback
        error={this.state.error}
        onReset={this.handleReset}
      />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div className={styles.title}>Something went wrong</div>
      <div className={styles.message}>
        {error?.message ?? "An unexpected error occurred. Please try refreshing the page."}
      </div>
      <Button appearance="primary" onClick={() => window.location.reload()}>
        Refresh page
      </Button>
      <Button appearance="subtle" onClick={onReset}>
        Try again
      </Button>
    </div>
  );
}
