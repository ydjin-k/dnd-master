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

/* Созвездная графика макета: вершины кости — звёзды, рёбра — тонкие линии.
   Координаты взяты из тех же контуров выше, чтобы звезда всегда садилась
   ровно на стык рёбер, а не рядом с ним. */
const vertices: Record<DieSides, Array<[number, number]>> = {
  4: [[32, 6], [5, 55], [59, 55], [32, 32]],
  6: [[10, 18], [32, 6], [54, 18], [54, 46], [32, 58], [10, 46], [32, 31]],
  8: [[32, 4], [58, 32], [32, 60], [6, 32], [18, 32], [46, 32]],
  10: [[32, 3], [56, 27], [45, 54], [32, 61], [19, 54], [8, 27], [32, 40]],
  12: [[32, 3], [54, 14], [61, 38], [45, 59], [19, 59], [3, 38], [10, 14], [20, 21], [44, 21], [32, 39]],
  20: [[32, 3], [59, 21], [49, 56], [15, 56], [5, 21], [32, 37]],
  100: [[32, 3], [56, 27], [45, 54], [32, 61], [19, 54], [8, 27], [32, 40]],
};

/* d100 в макете нет — он есть только у нас. Чтобы он не был неотличимой копией
   d10 (контур у них общий), десятку обводит вторая, пунктирная орбита: то же
   «×10», сказанное линией, а не только подписью. */
const decadeHalo = <path className="dice-icon__halo" d="M32 -3L67 24 51 63 32 73 13 63 -3 24z"/>;

export function dieSidesFromExpression(expression: string): DieSides | null {
  const match = expression.toLowerCase().match(/d(100|20|12|10|8|6|4)(?!\d)/);
  return match ? Number(match[1]) as DieSides : null;
}

export function DiceIcon({ sides, value, compact = false, log = false }: { sides: DieSides; value?: number; compact?: boolean; log?: boolean }) {
  return (
    <span className={`dice-icon dice-icon--d${sides}${compact ? " dice-icon--compact" : ""}${log ? " dice-icon--log" : ""}`} data-die={`d${sides}`} role="img" aria-label={`Кость d${sides}${value === undefined ? "" : `, результат ${value}`}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="dice-icon__shape">{outlines[sides]}</g>
        {sides === 100 && decadeHalo}
        <g className="dice-icon__stars">
          {vertices[sides].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.1"/>)}
        </g>
        {value !== undefined && <text x="32" y="37" textAnchor="middle" className="dice-icon__value">{value}</text>}
        {sides === 100 && <text x="32" y="49" textAnchor="middle" className="dice-icon__multiplier">×10</text>}
      </svg>
    </span>
  );
}
