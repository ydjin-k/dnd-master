import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? "" });
    console.error("Необработанная ошибка в дереве компонентов:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "1em", color: "var(--dm-danger, #f66)", whiteSpace: "pre-wrap" }}>
          <h2>Ошибка интерфейса</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
          <pre>{this.state.info}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
