import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignProvider, useCampaign } from "./state/CampaignContext";
import { SoundtrackProvider } from "./state/SoundtrackContext";
import type { CampaignState } from "./state/types";
import { AppShell } from "./ui/AppShell";
import { Launcher } from "./ui/Launcher";
import { AdventurePage } from "./ui/pages/AdventurePage";
import { CombatPage } from "./ui/pages/CombatPage";
import { DicePage } from "./ui/pages/DicePage";
import { CharactersPage } from "./ui/pages/CharactersPage";
import { JournalPage } from "./ui/pages/JournalPage";
import { RulesPage } from "./ui/pages/RulesPage";
import { SpellsPage } from "./ui/pages/SpellsPage";
import { BestiaryPage } from "./ui/pages/BestiaryPage";
import { SoundboardPage } from "./ui/pages/SoundboardPage";
import "./ui/theme.css";

function AppContent({ onSwitchCampaign }: { onSwitchCampaign: () => void }) {
  const { loading, error } = useCampaign();

  if (loading) {
    return <p>Загрузка кампании…</p>;
  }

  return (
    <>
      {error && <p style={{ color: "var(--dm-danger)" }}>Не удалось сохранить: {error}</p>}
      <AppShell onSwitchCampaign={onSwitchCampaign}>
        {(tab) => {
          switch (tab) {
            case "adventure":
              return <AdventurePage />;
            case "combat":
              return <CombatPage />;
            case "dice":
              return <DicePage />;
            case "characters":
              return <CharactersPage />;
            case "journal":
              return <JournalPage />;
            case "rules":
              return <RulesPage />;
            case "spells":
              return <SpellsPage />;
            case "bestiary":
              return <BestiaryPage />;
            case "soundboard":
              return <SoundboardPage />;
          }
        }}
      </AppShell>
    </>
  );
}

type Phase = "loading" | "launcher" | "playing";

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  // Меняется при каждом входе в кампанию — форсирует пересоздание
  // CampaignProvider, чтобы он не тащил состояние предыдущей кампании.
  const [campaignKey, setCampaignKey] = useState(0);

  useEffect(() => {
    invoke<CampaignState | null>("load_active_campaign")
      .then((state) => setPhase(state ? "playing" : "launcher"))
      .catch(() => setPhase("launcher"));
  }, []);

  function enterCampaign() {
    setCampaignKey((k) => k + 1);
    setPhase("playing");
  }

  if (phase === "loading") {
    return <p>Загрузка…</p>;
  }

  if (phase === "launcher") {
    return <Launcher onEnter={enterCampaign} />;
  }

  // SoundtrackProvider — снаружи AppShell (и снаружи пере-ключаемого
  // CampaignProvider): <audio> живут выше свитча вкладок, поэтому уход со
  // «Саундборда» на «Бой» не обрывает музыку.
  return (
    <SoundtrackProvider>
      <CampaignProvider key={campaignKey}>
        <AppContent onSwitchCampaign={() => setPhase("launcher")} />
      </CampaignProvider>
    </SoundtrackProvider>
  );
}

export default App;
