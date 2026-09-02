import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installButtonClickSound } from "./audio/uiSounds";
import { ErrorBoundary } from "./ui/ErrorBoundary";

installButtonClickSound();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
