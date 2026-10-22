import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LOADING_MIN_MS, LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("держится 3 секунды даже при мгновенной загрузке, затем растворяется и уходит", async () => {
    render(<LoadingScreen />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Загрузка");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_MIN_MS - 100);
    });
    expect(screen.getByRole("status")).not.toHaveClass("loading-screen--fading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByRole("status")).toHaveClass("loading-screen--fading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ждёт фоновое видео главной, если оно грузится дольше трёх секунд", async () => {
    const video = document.createElement("video");
    video.className = "launcher__background";
    document.body.appendChild(video);
    render(<LoadingScreen />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_MIN_MS + 2000);
    });
    expect(screen.getByRole("status"), "ушла, не дождавшись видео").not.toHaveClass("loading-screen--fading");

    await act(async () => {
      video.dispatchEvent(new Event("canplaythrough"));
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    video.remove();
  });
});
