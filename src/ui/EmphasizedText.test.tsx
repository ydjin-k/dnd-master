import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmphasizedText } from "./EmphasizedText";

describe("EmphasizedText", () => {
  it("bolds a named feature before a colon", () => {
    render(<p><EmphasizedText>Приют для верующих: вам помогут в храме.</EmphasizedText></p>);
    expect(screen.getByText("Приют для верующих").tagName).toBe("STRONG");
  });

  it("bolds a stat-block trait before its first sentence", () => {
    render(<p><EmphasizedText>Острый нюх. Волк совершает проверки с преимуществом.</EmphasizedText></p>);
    expect(screen.getByText("Острый нюх").tagName).toBe("STRONG");
  });

  it("uses the earliest delimiter in a stat-block action", () => {
    render(<p><EmphasizedText>Укус. Рукопашная атака: +4 к попаданию.</EmphasizedText></p>);
    expect(screen.getByText("Укус").tagName).toBe("STRONG");
    expect(screen.queryByText("Укус. Рукопашная атака")).not.toBeInTheDocument();
  });

  it("leaves ordinary prose intact", () => {
    render(<p><EmphasizedText>Это обычный абзац без именованного свойства</EmphasizedText></p>);
    expect(screen.queryByRole("strong")).not.toBeInTheDocument();
  });
});
