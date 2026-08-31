import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { RuleTopic, Spell } from "../../state/types";
import { RuleBlockView } from "../RuleBlockView";
import { SpellView } from "../SpellView";
import "./RulesPage.css";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

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

type ActiveSelection = { kind: "topic"; id: string } | { kind: "spell"; id: string } | null;

export function RulesPage() {
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [spells, setSpells] = useState<Spell[]>([]);
  const [active, setActive] = useState<ActiveSelection>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules")
      .then((loaded) => {
        setTopics(loaded);
        if (loaded.length > 0) setActive({ kind: "topic", id: loaded[0].id });
      })
      .catch((e) => setError(String(e)));
    invoke<Spell[]>("get_spells")
      .then(setSpells)
      .catch((e) => setError(String(e)));
  }, []);

  const classLabel = (classId: string) => topics.find((t) => t.id === classId)?.title ?? classId;

  const activeTopic = active?.kind === "topic" ? topics.find((t) => t.id === active.id) : undefined;
  const activeSpell = active?.kind === "spell" ? spells.find((sp) => sp.id === active.id) : undefined;
  const categories = [...new Set(topics.map((t) => t.category))];

  const cantrips = spells.filter((sp) => sp.level === 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const firstLevelSpells = spells
    .filter((sp) => sp.level === 1)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <div className="rules-page">
      <nav className="rules-page__nav">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="rules-page__nav-category">{CATEGORY_LABEL[cat] ?? cat}</div>
            {topics
              .filter((t) => t.category === cat)
              .map((t) => (
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
        ))}

        {spells.length > 0 && (
          <>
            <div>
              <div className="rules-page__nav-category">Заговоры</div>
              {cantrips.map((sp) => (
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
            <div>
              <div className="rules-page__nav-category">Заклинания 1 уровня</div>
              {firstLevelSpells.map((sp) => (
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
          </>
        )}
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
        {activeSpell && <SpellView spell={activeSpell} classLabel={classLabel} />}

        {activeSpell ? (
          <footer className="rules-page__attribution">
            Текст заклинания — перевод официального{" "}
            <ExternalLink href="https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf">
              System Reference Document 5.1
            </ExternalLink>{" "}
            от Wizards of the Coast, распространяется по лицензии{" "}
            <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>.
          </footer>
        ) : (
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
        )}
      </div>
    </div>
  );
}
