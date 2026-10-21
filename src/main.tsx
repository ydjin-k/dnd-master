import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installButtonClickSound } from "./audio/uiSounds";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { isPlayersWindow } from "./ui/dungeons/playersMap";
import { PlayersWindow } from "./ui/PlayersWindow";

/**
 * Окон у приложения два, и пакет у них один: какое из них открылось, видно по
 * ярлыку окна (`isPlayersWindow`). У игроков не вкладка приложения и не
 * «режим», а своя страница: ни кампании, ни вкладок, ни звуков кнопок — и
 * никакого пути к ним из окна у стола.
 */
const players = isPlayersWindow();

// Звук нажатия — хозяйство мастера: у стола кнопка одна, и щёлкать ей незачем.
if (!players) installButtonClickSound();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{players ? <PlayersWindow /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
