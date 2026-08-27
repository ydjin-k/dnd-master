import { CampaignProvider, useCampaign } from "./state/CampaignContext";
import { AppShell } from "./ui/AppShell";
import { AdventurePage } from "./ui/pages/AdventurePage";
import { DicePage } from "./ui/pages/DicePage";
import { CharactersPage } from "./ui/pages/CharactersPage";
import { ImportPage } from "./ui/pages/ImportPage";
import { JournalPage } from "./ui/pages/JournalPage";
import "./ui/theme.css";

function AppContent() {
  const { loading, error } = useCampaign();

  if (loading) {
    return <p>Загрузка кампании…</p>;
  }

  return (
    <>
      {error && <p style={{ color: "var(--dm-danger)" }}>Не удалось сохранить: {error}</p>}
      <AppShell>
        {(tab) => {
          switch (tab) {
            case "adventure":
              return <AdventurePage />;
            case "dice":
              return <DicePage />;
            case "characters":
              return <CharactersPage />;
            case "import":
              return <ImportPage />;
            case "journal":
              return <JournalPage />;
          }
        }}
      </AppShell>
    </>
  );
}

function App() {
  return (
    <CampaignProvider>
      <AppContent />
    </CampaignProvider>
  );
}

export default App;
