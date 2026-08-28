import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RulesPage } from "./RulesPage";
import type { RuleTopic } from "../../state/types";

const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "https://example.test/human", blocks: [{ type: "paragraph", text: "Люди — самая распространённая раса." }] },
  { id: "classes-fighter", category: "classes", title: "Воин", sourceUrl: "https://example.test/fighter", blocks: [{ type: "heading", level: 1, text: "Воин" }] },
];

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => topics) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("RulesPage", () => {
  it("loads topics, shows the first one by default, and switches on click without crashing", async () => {
    render(<RulesPage />);

    await waitFor(() => expect(screen.getByText(/Люди — самая распространённая раса/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Воин"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Воин" })).toBeInTheDocument());
  });
});
