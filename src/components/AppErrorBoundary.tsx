import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";
import { reportFrontendError } from "../logging";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportFrontendError(
      `React render failed${info.componentStack ?? ""}`,
      error,
      "react.error-boundary",
    );
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">{i18n.t("errors.appCrashedTitle")}</h1>
          <p className="mt-2 text-sm text-slate-400">{i18n.t("errors.appCrashedHint")}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {i18n.t("errors.reloadApp")}
          </button>
        </div>
      </main>
    );
  }
}
