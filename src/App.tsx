import { useState } from "react";
import { CampaignProvider, useCampaign } from "./state/CampaignContext";
import { DiceLogProvider } from "./state/DiceLogContext";
import { SoundtrackProvider } from "./state/SoundtrackContext";
import { AppShell } from "./ui/AppShell";
import { Launcher } from "./ui/Launcher";
import { AdventuresPage } from "./ui/pages/AdventuresPage";
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
            case "adventures":
              return <AdventuresPage />;
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

type Phase = "launcher" | "playing";

function App() {
  // Запуск ВСЕГДА начинается с приветственного окна — даже когда на диске
  // лежит активная кампания. Решение владельца 07.10.2026: приложение не
  // должно открывать кампанию само, выбор хроники делает человек. Раньше App
  // спрашивал load_active_campaign и при непустом ответе сразу уходил в
  // "playing"; указатель активной кампании при этом НЕ отменён — он
  // по-прежнему нужен CampaignProvider, которому Launcher передаёт выбор
  // через switch_campaign.
  const [phase, setPhase] = useState<Phase>("launcher");
  // Меняется при каждом входе в кампанию — форсирует пересоздание
  // CampaignProvider, чтобы он не тащил состояние предыдущей кампании.
  const [campaignKey, setCampaignKey] = useState(0);

  function enterCampaign() {
    setCampaignKey((k) => k + 1);
    setPhase("playing");
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
        {/* DiceLogProvider — внутри CampaignProvider, но над AppShell: журнал
            бросков переживает смену вкладки и обнуляется вместе с кампанией. */}
        <DiceLogProvider>
          <AppContent onSwitchCampaign={() => setPhase("launcher")} />
        </DiceLogProvider>
      </CampaignProvider>
    </SoundtrackProvider>
  );
}

export default App;
