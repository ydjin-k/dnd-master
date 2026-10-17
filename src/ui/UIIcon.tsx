import type { Tab } from "./AppShell";

type IconName = Tab | "campaign";

export const TAB_ICON_PATHS = {
  adventures: "/ui-icons/adventures.png",
  dungeons: "/ui-icons/dungeons.png",
  combat: "/ui-icons/combat.png",
  dice: "/ui-icons/dice.png",
  characters: "/ui-icons/characters.png",
  journal: "/ui-icons/journal.png",
  rules: "/ui-icons/rules.png",
  spells: "/ui-icons/spells.png",
  bestiary: "/ui-icons/bestiary.png",
  soundboard: "/ui-icons/soundboard.png",
} satisfies Record<Tab, string>;

export function UIIcon({ name }: { name: IconName }) {
  if (name !== "campaign") {
    return <img className="ui-icon" src={TAB_ICON_PATHS[name]} alt="" aria-hidden="true" />;
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7l2 4 4 1-4 2-2 4-2-4-4-2 4-1z" />
    </svg>
  );
}
