import { CampaignProvider, useCampaign } from "./state/CampaignContext";
import { AppShell } from "./ui/AppShell";
import { CharactersPage } from "./ui/pages/CharactersPage";
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
        {(tab) => (tab === "characters" ? <CharactersPage /> : <JournalPage />)}
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
