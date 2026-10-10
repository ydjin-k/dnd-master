import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TABS } from "./AppShell";
import { TAB_ICON_PATHS, UIIcon } from "./UIIcon";

const filesOnDisk = new Set(
  Object.keys(
    import.meta.glob("../../public/ui-icons/*.{png,webp}", {
      eager: false,
    }),
  ).map((key) => key.replace("../../public", "")),
);

describe("значки вкладок", () => {
  it("каталог на диске непуст — иначе сверка ниже зелёная ни о чём", () => {
    expect(filesOnDisk.size).toBeGreaterThan(0);
  });

  it("у каждой вкладки есть файл, на который указывает UIIcon", () => {
    const missing = TABS.filter(({ id }) => !filesOnDisk.has(TAB_ICON_PATHS[id])).map(
      ({ id }) => `${id}: ${TAB_ICON_PATHS[id]}`,
    );

    expect(missing).toEqual([]);
  });

  it("в каталоге нет файлов, не принадлежащих вкладкам", () => {
    const listed = new Set(TABS.map(({ id }) => TAB_ICON_PATHS[id]));
    const orphans = [...filesOnDisk].filter((file) => !listed.has(file));

    expect(orphans).toEqual([]);
  });

  it.each(TABS)("$id рисуется растровым значком $label", ({ id }) => {
    const { container } = render(<UIIcon name={id} />);
    const icon = container.querySelector("img.ui-icon");

    expect(icon).toHaveAttribute("src", TAB_ICON_PATHS[id]);
    expect(icon).toHaveAttribute("alt", "");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("campaign остаётся векторным", () => {
    const { container } = render(<UIIcon name="campaign" />);

    expect(container.querySelector("svg.ui-icon")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
