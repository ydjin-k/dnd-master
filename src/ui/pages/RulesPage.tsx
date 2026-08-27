import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { RuleBlock, RuleTopic } from "../../state/types";
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
};

function RuleBlockView({ block }: { block: RuleBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${Math.min(block.level + 1, 6)}` as unknown) as "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className="rules-page__heading">{block.text}</Tag>;
    }
    case "paragraph":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="rules-page__table-wrap">
          <table>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function RulesPage() {
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules")
      .then((loaded) => {
        setTopics(loaded);
        if (loaded.length > 0) setActiveId(loaded[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const active = topics.find((t) => t.id === activeId);
  const categories = [...new Set(topics.map((t) => t.category))];

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
                    "rules-page__nav-item" + (t.id === activeId ? " rules-page__nav-item--active" : "")
                  }
                  onClick={() => setActiveId(t.id)}
                >
                  {t.title}
                </button>
              ))}
          </div>
        ))}
      </nav>

      <div className="rules-page__content">
        {error && <p className="rules-page__error">Не удалось загрузить правила: {error}</p>}
        {active && (
          <article>
            {active.blocks.map((block, i) => (
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
          {active?.sourceUrl && (
            <>
              {" "}
              Источник этого раздела:{" "}
              <ExternalLink href={active.sourceUrl}>{active.sourceUrl}</ExternalLink>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
