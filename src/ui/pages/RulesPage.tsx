import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RuleTopic } from "../../state/types";
import { ExternalLink } from "../ExternalLink";
import { RuleBlockView } from "../RuleBlockView";
import { SPELLCASTING_CATEGORY } from "./spellcastingCategory";
import "./RulesPage.css";

const CATEGORY_LABEL: Record<string, string> = {
  gameplay: "Игровой процесс",
  combat: "Бой",
  appendices: "Приложения",
  races: "Расы",
  classes: "Классы",
  character: "Персонаж",
  equipment: "Экипировка",
  "additional-rules": "Дополнительные правила",
};

export function RulesPage() {
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules")
      .then((loaded) => {
        // Заклинания и правила их сотворения целиком у вкладки «Заклинания»
        // (SpellsPage): здесь не показывается ни список Spell[], ни темы
        // категории заклинаний — иначе у одного текста стало бы два места показа.
        const ruleTopics = loaded.filter((t) => t.category !== SPELLCASTING_CATEGORY);
        setTopics(ruleTopics);
        if (ruleTopics.length > 0) setActiveId(ruleTopics[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const activeTopic = topics.find((t) => t.id === activeId);

  const query = search.trim().toLowerCase();
  const visibleTopics = query ? topics.filter((t) => t.title.toLowerCase().includes(query)) : topics;
  const categories = [...new Set(visibleTopics.map((t) => t.category))];

  useEffect(() => {
    if (!query) return;
    if (visibleTopics.length === 1) setActiveId(visibleTopics[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="rules-page">
      <nav className="rules-page__nav">
        <input
          type="text"
          className="rules-page__search"
          placeholder="Поиск по темам..."
          aria-label="Поиск по темам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="rules-page__list" role="region" aria-label="Список тем правил" tabIndex={0}>
          {categories.map((cat) => (
            <div key={cat}>
              <div className="rules-page__nav-category">{CATEGORY_LABEL[cat] ?? cat}</div>
              {visibleTopics
                .filter((t) => t.category === cat)
                .map((t) => (
                  <button
                    key={t.id}
                    className={
                      "rules-page__nav-item" +
                      (activeId === t.id ? " rules-page__nav-item--active" : "")
                    }
                    onClick={() => setActiveId(t.id)}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="rules-page__content">
        {error && <p className="rules-page__error">Не удалось загрузить правила: {error}</p>}
        {activeTopic && (
          <article>
            {activeTopic.blocks.map((block, i) => (
              <RuleBlockView key={i} block={block} />
            ))}
          </article>
        )}

        <footer className="rules-page__attribution">
          Текст правил — перевод SRD 5.1 для D&amp;D 5e,{" "}
          <ExternalLink href="https://longstoryshort.app/srd/">longstoryshort.app</ExternalLink>{" "}
          (автор перевода — cyborgsandmages), распространяется по лицензии{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
            CC BY-NC-SA 4.0
          </ExternalLink>
          .
          {activeTopic?.sourceUrl && (
            <>
              {" "}
              Источник этого раздела:{" "}
              <ExternalLink href={activeTopic.sourceUrl}>{activeTopic.sourceUrl}</ExternalLink>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
