import type { COIN_DENOMINATIONS } from "./characterCreationData";

type Coin = (typeof COIN_DENOMINATIONS)[number];

const shapes: Record<Coin["icon"]["shape"], string> = {
  round: "M32 6a26 26 0 1 0 0 52 26 26 0 0 0 0-52Z",
  square: "M12 9h40a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3Z",
  scalloped: "M32 5l7 5 9-1 5 8 7 5-2 9 2 9-7 5-5 8-9-1-7 5-7-5-9 1-5-8-7-5 2-9-2-9 7-5 5-8 9 1Z",
  diamond: "M32 4 59 32 32 60 5 32Z",
  octagonal: "M20 5h24l15 15v24L44 59H20L5 44V20Z",
};

export function CoinIcon({ denomination }: { denomination: Coin }) {
  return (
    <span className="coin-icon" role="img" aria-label={denomination.fullName} title={denomination.fullName}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d={shapes[denomination.icon.shape]} fill={denomination.icon.fill} stroke={denomination.icon.rim} strokeWidth="4" />
        <circle cx="32" cy="32" r="12" fill="none" stroke={denomination.icon.rim} strokeWidth="3" opacity=".8" />
        <path d="M25 34c4-8 10-8 14 0" fill="none" stroke={denomination.icon.rim} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
