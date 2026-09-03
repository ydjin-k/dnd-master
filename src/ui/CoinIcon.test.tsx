import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoinIcon } from "./CoinIcon";
import { COIN_DENOMINATIONS } from "./characterCreationData";

describe("CoinIcon", () => {
  it.each(COIN_DENOMINATIONS)("names $key with its full name, not the abbreviation ($label)", (denomination) => {
    render(<CoinIcon denomination={denomination} />);
    const icon = screen.getByRole("img");
    expect(icon).toHaveAttribute("title", denomination.fullName);
    expect(icon).toHaveAttribute("aria-label", denomination.fullName);
    expect(icon.getAttribute("title")).not.toBe(denomination.label);
  });
});
