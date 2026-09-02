export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

const outlines: Record<DieSides, React.ReactNode> = {
  4: <><path d="M32 6L5 55h54z"/><path d="M32 6v49M5 55l27-23 27 23"/></>,
  6: <><path d="M10 18l22-12 22 12v28L32 58 10 46z"/><path d="M10 18l22 13 22-13M32 31v27"/></>,
  8: <><path d="M32 4L58 32 32 60 6 32z"/><path d="M32 4v56M6 32h52M32 4L18 32l14 28 14-28z"/></>,
  10: <><path d="M32 3L56 27 45 54 32 61 19 54 8 27z"/><path d="M32 3v58M8 27l24 13 24-13M19 54l13-14 13 14"/></>,
  12: <><path d="M32 3l22 11 7 24-16 21H19L3 38l7-24z"/><path d="M32 3L20 21l12 18 12-18zM10 14l10 7-17 17M54 14l-10 7 17 17M19 59l13-20 13 20"/></>,
  20: <><path d="M32 3L59 21 49 56H15L5 21z"/><path d="M32 3v53M5 21h54M15 56l17-35 17 35M5 21l27 16 27-16"/></>,
  100: <><path d="M32 3L56 27 45 54 32 61 19 54 8 27z"/><path d="M32 3v58M8 27l24 13 24-13M19 54l13-14 13 14"/></>,
};

export function dieSidesFromExpression(expression: string): DieSides | null {
  const match = expression.toLowerCase().match(/d(100|20|12|10|8|6|4)(?!\d)/);
  return match ? Number(match[1]) as DieSides : null;
}

export function DiceIcon({ sides, value, compact = false }: { sides: DieSides; value?: number; compact?: boolean }) {
  return (
    <span className={`dice-icon dice-icon--d${sides}${compact ? " dice-icon--compact" : ""}`} data-die={`d${sides}`} role="img" aria-label={`Кость d${sides}${value === undefined ? "" : `, результат ${value}`}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="dice-icon__shape">{outlines[sides]}</g>
        {value !== undefined && <text x="32" y="37" textAnchor="middle" className="dice-icon__value">{value}</text>}
        {sides === 100 && <text x="32" y="49" textAnchor="middle" className="dice-icon__multiplier">×10</text>}
      </svg>
    </span>
  );
}
