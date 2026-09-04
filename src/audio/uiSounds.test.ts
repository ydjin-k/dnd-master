import { describe, expect, it, vi } from "vitest";
import { installButtonClickSound } from "./uiSounds";

describe("installButtonClickSound", () => {
  it("owns active button clicks and ignores disabled controls and other elements", () => {
    const play = vi.fn();
    const uninstall = installButtonClickSound(document, play);
    const active = document.createElement("button");
    const child = document.createElement("span");
    active.append(child);
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    const ariaDisabled = document.createElement("div");
    ariaDisabled.setAttribute("role", "button");
    ariaDisabled.setAttribute("aria-disabled", "true");
    const other = document.createElement("div");
    document.body.append(active, disabled, roleButton, ariaDisabled, other);

    child.click();
    disabled.click();
    roleButton.click();
    ariaDisabled.click();
    other.click();

    expect(play).toHaveBeenCalledTimes(2);
    uninstall();
    document.body.replaceChildren();
  });

  it("skips buttons that already play their own dedicated sound", () => {
    const play = vi.fn();
    const uninstall = installButtonClickSound(document, play);
    const ownSound = document.createElement("button");
    ownSound.setAttribute("data-own-sound", "");
    document.body.append(ownSound);

    ownSound.click();

    expect(play).not.toHaveBeenCalled();
    uninstall();
    document.body.replaceChildren();
  });
});
