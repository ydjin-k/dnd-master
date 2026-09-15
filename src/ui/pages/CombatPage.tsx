import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import type { MonsterTemplate, Spell } from "../../state/types";
import { UIIcon } from "../UIIcon";
import "./CombatPage.css";

function StartCombatPanel() {
  const { state, startCombat } = useCampaign();
  const [bestiary, setBestiary] = useState<MonsterTemplate[]>([]);
  const [monsterIds, setMonsterIds] = useState<string[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);

  useEffect(() => {
    invoke<MonsterTemplate[]>("get_bestiary").then(setBestiary);
  }, []);

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <div className="combat-start">
      <h2>Бой</h2>
      <p className="combat-start__hint dm-hint">Выбери противников и участников, затем начни бой.</p>

      <h3>Противники</h3>
      <div className="combat-start__list">
        {bestiary.map((m) => (
          <label key={m.id} className="combat-start__option">
            <input
              type="checkbox"
              checked={monsterIds.includes(m.id)}
              onChange={() => toggle(monsterIds, setMonsterIds, m.id)}
            />
            {m.name} (КД {m.armorClass}, {m.maxHp} HP)
          </label>
        ))}
      </div>

      <h3>Персонажи</h3>
      <div className="combat-start__list">
        {state.characters.map((c) => (
          <label key={c.id} className="combat-start__option">
            <input
              type="checkbox"
              checked={characterIds.includes(c.id)}
              onChange={() => toggle(characterIds, setCharacterIds, c.id)}
            />
            {c.name} ({c.currentHp}/{c.maxHp} HP)
          </label>
        ))}
        {state.characters.length === 0 && (
          <p className="combat-start__empty">
            Персонажей нет — добавь их на вкладке «Персонажи».
          </p>
        )}
      </div>

      <button
        className="dm-button--primary"
        disabled={monsterIds.length === 0 || characterIds.length === 0}
        onClick={() => startCombat(monsterIds, characterIds)}
      >
        Начать бой
      </button>
    </div>
  );
}

export function CombatPage() {
  const {
    state,
    moveCombatant,
    combatAttack,
    combatCastSpell,
    applyDamage,
    endTurn,
    monsterAutoTurn,
    endCombat,
  } = useCampaign();
  const combat = state.combat;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [spells, setSpells] = useState<Spell[]>([]);
  const [castSpellId, setCastSpellId] = useState<string>("");

  useEffect(() => {
    invoke<Spell[] | null>("get_spells").then((s) => setSpells(s ?? []));
  }, []);

  if (!combat) {
    return <StartCombatPanel />;
  }

  const currentId = combat.turnOrder[combat.currentTurnIndex];
  const current = combat.combatants.find((c) => c.id === currentId);
  const currentCharacter =
    current && !current.isMonster ? state.characters.find((c) => c.id === current.id) : undefined;
  // Что боец может творить прямо сейчас: заговоры плюс `castableSpells` —
  // подготовленное у класса с подготовкой, известное у класса с известным
  // списком. Разбирать, чьё тут что, бою не нужно, и права творить он не
  // пересчитывает: его владелец — `cast_spell_action` на стороне Rust.
  const castableSpellIds = currentCharacter
    ? [...currentCharacter.knownCantrips, ...currentCharacter.castableSpells]
    : [];
  const castableSpellList = spells.filter((s) => castableSpellIds.includes(s.id));
  const selectedSpell = castableSpellList.find((s) => s.id === castSpellId);
  const spellNeedsTarget = !!selectedSpell && (selectedSpell.attackRoll || !!selectedSpell.savingThrow);
  /** SRD: заклинание творится ячейкой своего круга или любого старшего — у Колдуна доступен только высший. */
  function hasFreeSlotFor(circle: number): boolean {
    const slots = currentCharacter?.spellSlotsCurrent ?? [];
    return slots.slice(circle - 1).some((free) => free > 0);
  }
  const spellBlockedBySlot = !!selectedSpell && selectedSpell.level > 0 && !hasFreeSlotFor(selectedSpell.level);
  const cells = Array.from({ length: combat.gridWidth * combat.gridHeight });

  function combatantAt(x: number, y: number) {
    return combat!.combatants.find((c) => c.x === x && c.y === y);
  }

  function handleCellClick(x: number, y: number) {
    const occupant = combatantAt(x, y);
    if (occupant && occupant.currentHp > 0) {
      setSelectedId(occupant.id);
      return;
    }
    if (selectedId) {
      moveCombatant(selectedId, x, y);
    }
  }

  return (
    <div className="combat-page">
      <div className="combat-page__layout">
        <div
          className="combat-grid"
          style={{
            gridTemplateColumns: `repeat(${combat.gridWidth}, 1fr)`,
            gridTemplateRows: `repeat(${combat.gridHeight}, 1fr)`,
          }}
        >
          {cells.map((_, i) => {
            const x = i % combat.gridWidth;
            const y = Math.floor(i / combat.gridWidth);
            const occupant = combatantAt(x, y);
            return (
              <div
                key={i}
                className="combat-grid__cell"
                onClick={() => handleCellClick(x, y)}
              >
                {occupant && (
                  <div
                    className={
                      "combat-token" +
                      (occupant.isMonster ? " combat-token--monster" : " combat-token--player") +
                      (occupant.id === selectedId ? " combat-token--selected" : "") +
                      (occupant.id === currentId ? " combat-token--current" : "") +
                      (occupant.currentHp <= 0 ? " combat-token--down" : "")
                    }
                    title={`${occupant.name}: ${occupant.currentHp}/${occupant.maxHp} HP`}
                  >
                    {occupant.name.slice(0, 2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="combat-sidebar">
          <p className={`combat-sidebar__round dm-pill ${combat.finished ? "dm-pill--done" : "dm-pill--progress"}`}>
            Раунд {combat.round} {combat.finished && "— бой завершён"}
          </p>
          <p className="combat-sidebar__turn">
            Ходит: <strong>{current?.name ?? "—"}</strong>
          </p>

          <div className="combat-sidebar__heading dm-card-head">
            <UIIcon name="combat" />
            <h3>Порядок хода</h3>
          </div>
          <ul className="combat-sidebar__order">
            {combat.turnOrder.map((id, index) => {
              const c = combat.combatants.find((c) => c.id === id);
              if (!c) return null;
              const hpPercent = Math.max(0, Math.min(100, (c.currentHp / c.maxHp) * 100));
              return (
                <li
                  key={id}
                  className={
                    "combat-sidebar__order-item dm-rank-row" +
                    (id === currentId ? " combat-sidebar__order-item--current" : "")
                  }
                >
                  <span className="dm-rank-row__index" aria-hidden="true">{index + 1}</span>
                  <span className="combat-sidebar__avatar" aria-hidden="true">{c.name.slice(0, 2)}</span>
                  <span className="combat-sidebar__order-name">{c.name}</span>
                  <span className="combat-sidebar__initiative">Иниц. {c.initiative}</span>
                  <span className="combat-sidebar__order-meta">{c.currentHp}/{c.maxHp} HP</span>
                  <span className="combat-sidebar__hp" title={`${c.currentHp}/${c.maxHp} HP`}>
                    <span className="dm-rank-row__bar" style={{ width: `${hpPercent}%` }} />
                  </span>
                  <span className="combat-sidebar__status" aria-hidden="true" />
                </li>
              );
            })}
          </ul>

          <div className="combat-sidebar__actions">
            {current?.isMonster && !combat.finished && (
              <button onClick={() => monsterAutoTurn()}>Авто-ход существа</button>
            )}

            <label>
              Цель:
              <select value={targetId} onChange={(e) => setTargetId(e.currentTarget.value)}>
                <option value="">—</option>
                {combat.combatants
                  .filter((c) => c.id !== selectedId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="dm-button--primary"
              disabled={!selectedId || !targetId || combat.finished}
              onClick={() => selectedId && targetId && combatAttack(selectedId, targetId)}
            >
              Атаковать выбранным
            </button>

            {currentCharacter && castableSpellList.length > 0 && (
              <div className="combat-sidebar__spellcasting">
                <label>
                  Заклинание:
                  <select
                    value={castSpellId}
                    onChange={(e) => setCastSpellId(e.currentTarget.value)}
                  >
                    <option value="">—</option>
                    {castableSpellList.map((s) => {
                      const noSlots = s.level > 0 && !hasFreeSlotFor(s.level);
                      return (
                        <option key={s.id} value={s.id} disabled={noSlots}>
                          {s.name}
                          {noSlots ? " (нет свободных ячеек)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <button
                  disabled={
                    !selectedSpell ||
                    combat.finished ||
                    spellBlockedBySlot ||
                    (spellNeedsTarget && !targetId)
                  }
                  onClick={() =>
                    selectedSpell &&
                    combatCastSpell(
                      currentId,
                      selectedSpell.id,
                      spellNeedsTarget ? targetId : null,
                    )
                  }
                >
                  Сотворить
                </button>
              </div>
            )}

            {selectedId && (
              <div className="combat-sidebar__hp-controls">
                <button onClick={() => applyDamage(selectedId, 5)}>−5 HP</button>
                <button onClick={() => applyDamage(selectedId, -5)}>+5 HP</button>
              </div>
            )}

            <button className="dm-button--primary" disabled={combat.finished} onClick={() => endTurn()}>
              Закончить ход
            </button>
            <button onClick={() => endCombat()}>Завершить бой</button>
          </div>
        </aside>
      </div>

      <h3>Журнал боя</h3>
      <ul className="combat-log">
        {combat.log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
