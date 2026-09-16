type IconName =
  | "adventures" | "combat" | "dice" | "characters"
  | "journal" | "rules" | "spells" | "bestiary" | "soundboard" | "campaign";

const paths: Record<IconName, React.ReactNode> = {
  adventures: <><path d="M4 20c5-1 6-6 9-9s5-4 7-7"/><path d="M14 4h6v6M5 16l3 3"/></>,
  combat: <><path d="M5 20L19 6M14 5l5 1 1 5M4 4l16 16"/><path d="M4 9V4h5M15 20h5v-5"/></>,
  dice: <><path d="M12 2l8 6-3 11H7L4 8z"/><path d="M12 2v17M4 8h16M7 19l5-11 5 11"/></>,
  characters: <><circle cx="9" cy="7" r="3"/><path d="M3 20c0-5 2-8 6-8s6 3 6 8M16 9l2 2 3-4M17 14h4"/></>,
  journal: <><path d="M5 3h11a3 3 0 013 3v15H8a3 3 0 01-3-3z"/><path d="M8 3v18M11 8h5M11 12h5"/></>,
  rules: <><path d="M4 5c4-2 7-1 8 1 1-2 4-3 8-1v15c-4-2-7-1-8 1-1-2-4-3-8-1z"/><path d="M12 6v15"/></>,
  spells: <><path d="M5 19L17 7"/><path d="M15 5l4 4"/><path d="M7 4l.9 2.1L10 7l-2.1.9L7 10l-.9-2.1L4 7l2.1-.9z"/></>,
  bestiary: <><path d="M4 19l2-9 4 3 2-9 2 9 4-3 2 9z"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></>,
  soundboard: <><path d="M9 17V5l11-2v12"/><ellipse cx="6" cy="17" rx="3" ry="2.4"/><ellipse cx="17" cy="15" rx="3" ry="2.4"/></>,
  campaign: <><circle cx="12" cy="12" r="8"/><path d="M12 7l2 4 4 1-4 2-2 4-2-4-4-2 4-1z"/></>,
};

export function UIIcon({ name }: { name: IconName }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
