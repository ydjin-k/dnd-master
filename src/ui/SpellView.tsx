import type { Spell } from "../state/types";
import "./SpellView.css";

export function SpellView({ spell, classLabel }: { spell: Spell; classLabel: (id: string) => string }) {
  const levelLabel = spell.level === 0 ? "Заговор" : `${spell.level} круг`;

  return (
    <div className="spell-view">
      <h2 className="spell-view__name">{spell.name}</h2>
      <p className="spell-view__subtitle">
        {levelLabel}, школа: {spell.school}
        {spell.ritual ? " (ритуал)" : ""}
      </p>

      <dl className="spell-view__stats">
        <dt>Время накладывания</dt>
        <dd>{spell.castingTime}</dd>
        <dt>Дистанция</dt>
        <dd>{spell.range}</dd>
        <dt>Компоненты</dt>
        <dd>{spell.components}</dd>
        <dt>Длительность</dt>
        <dd>
          {spell.duration}
          {spell.concentration ? " (концентрация)" : ""}
        </dd>
        <dt>Классы</dt>
        <dd>{spell.classes.map(classLabel).join(", ")}</dd>
      </dl>

      {(spell.damageDice || spell.savingThrow) && (
        <dl className="spell-view__stats">
          {spell.damageDice && (
            <>
              <dt>Урон</dt>
              <dd>
                {spell.damageDice}
                {spell.damageType ? ` (${spell.damageType})` : ""}
              </dd>
            </>
          )}
          {spell.attackRoll && (
            <>
              <dt>Атака</dt>
              <dd>бросок атаки заклинанием</dd>
            </>
          )}
          {spell.savingThrow && (
            <>
              <dt>Спасбросок</dt>
              <dd>{spell.savingThrow}</dd>
            </>
          )}
        </dl>
      )}

      {spell.description.split("\n").map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </div>
  );
}
