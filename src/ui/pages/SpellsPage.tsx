import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RuleTopic, Spell } from "../../state/types";
import { ExternalLink } from "../ExternalLink";
import { RuleBlockView } from "../RuleBlockView";
import { SpellView } from "../SpellView";
import { SPELLCASTING_CATEGORY } from "./spellcastingCategory";
// Раскладка справочника (навигация слева, статья справа) остаётся у
// RulesPage.css: копия тех же правил под именем .spells-page__* завела бы
// второго владельца одного и того же факта, а вкладка — та же двухколоночная
// страница справочника. Переименование класса в нейтральное — внешний вид,
// зона ui-developer (карточка ui-layout-systemic-audit-and-fixes).
import "./RulesPage.css";

/** «Заговоры» вместо «Заклинания 0 круга» — 0 круг в SRD зовётся заговорами. */
function levelLabel(level: number) {
  return level === 0 ? "Заговоры" : `Заклинания ${level} круга`;
}

type ActiveSelection = { kind: "topic"; id: string } | { kind: "spell"; id: string } | null;

export function SpellsPage() {
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [spells, setSpells] = useState<Spell[]>([]);
  const [active, setActive] = useState<ActiveSelection>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules")
      .then((loaded) => {
        setTopics(loaded);
        const first = loaded.find((t) => t.category === SPELLCASTING_CATEGORY);
        if (first) setActive({ kind: "topic", id: first.id });
      })
      .catch((e) => setError(String(e)));
    invoke<Spell[]>("get_spells")
      .then(setSpells)
      .catch((e) => setError(String(e)));
  }, []);

  // Классы у заклинания записаны идентификаторами тем (`classes-bard`) —
  // человеческое имя берётся из полного списка тем, а не дублируется здесь.
  const classLabel = (classId: string) => topics.find((t) => t.id === classId)?.title ?? classId;

  const query = search.trim().toLowerCase();

  const rulesTopics = useMemo(
    () => topics.filter((t) => t.category === SPELLCASTING_CATEGORY),
    [topics],
  );
  const visibleRulesTopics = query
    ? rulesTopics.filter((t) => t.title.toLowerCase().includes(query))
    : rulesTopics;

  // Секции кругов рождаются из самих данных: круги, которые есть в spells.json,
  // отсортированы по возрастанию. Девять одинаковых блоков в разметке разъехались
  // бы на первой же правке, а жёсткий список 0-9 промолчал бы о круге сверх него.
  const spellsByLevel = useMemo(() => {
    const groups = new Map<number, Spell[]>();
    for (const spell of spells) {
      const group = groups.get(spell.level);
      if (group) group.push(spell);
      else groups.set(spell.level, [spell]);
    }
    for (const group of groups.values()) group.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [spells]);

  const visibleByLevel = useMemo(
    () =>
      spellsByLevel
        .map(
          ([level, group]) =>
            [level, query ? group.filter((sp) => sp.name.toLowerCase().includes(query)) : group] as const,
        )
        .filter(([, group]) => group.length > 0),
    [spellsByLevel, query],
  );

  const activeTopic = active?.kind === "topic" ? topics.find((t) => t.id === active.id) : undefined;
  const activeSpell = active?.kind === "spell" ? spells.find((sp) => sp.id === active.id) : undefined;

  useEffect(() => {
    if (!query) return;
    const matches: ActiveSelection[] = [
      ...visibleRulesTopics.map((t): ActiveSelection => ({ kind: "topic", id: t.id })),
      ...visibleByLevel.flatMap(([, group]) =>
        group.map((sp): ActiveSelection => ({ kind: "spell", id: sp.id })),
      ),
    ];
    if (matches.length === 1) setActive(matches[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="rules-page">
      <nav className="rules-page__nav">
        <input
          type="text"
          className="rules-page__search"
          placeholder="Поиск по заклинаниям и правилам..."
          aria-label="Поиск по заклинаниям и правилам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {visibleRulesTopics.length > 0 && (
          <div>
            <div className="rules-page__nav-category">Правила сотворения</div>
            {visibleRulesTopics.map((t) => (
              <button
                key={t.id}
                className={
                  "rules-page__nav-item" +
                  (active?.kind === "topic" && active.id === t.id ? " rules-page__nav-item--active" : "")
                }
                onClick={() => setActive({ kind: "topic", id: t.id })}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}

        {visibleByLevel.map(([level, group]) => (
          <div key={level}>
            <div className="rules-page__nav-category">{levelLabel(level)}</div>
            {group.map((sp) => (
              <button
                key={sp.id}
                className={
                  "rules-page__nav-item" +
                  (active?.kind === "spell" && active.id === sp.id ? " rules-page__nav-item--active" : "")
                }
                onClick={() => setActive({ kind: "spell", id: sp.id })}
              >
                {sp.name}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="rules-page__content">
        {error && <p className="rules-page__error">Не удалось загрузить заклинания: {error}</p>}
        {activeTopic && (
          <article>
            {activeTopic.blocks.map((block, i) => (
              <RuleBlockView key={i} block={block} />
            ))}
          </article>
        )}
        {activeSpell && <SpellView spell={activeSpell} classLabel={classLabel} />}

        <footer className="rules-page__attribution">
          Текст заклинаний и правил сотворения — перевод официального{" "}
          <ExternalLink href="https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf">
            System Reference Document 5.1
          </ExternalLink>{" "}
          от Wizards of the Coast, распространяется по лицензии{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>.
        </footer>
      </div>
    </div>
  );
}
