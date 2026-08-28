/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { LazyFeatureRoute, type LazyFeatureLoader } from "./lazy-screen";

interface FeatureProps {
  value: string;
}

function Feature({ value }: FeatureProps) {
  return <div data-testid="loaded-feature">{value}</div>;
}

afterEach(cleanup);

describe("LazyFeatureRoute", () => {
  it("renders an accessible loading state and commits the loaded feature", async () => {
    let resolveLoad: ((module: { default: ComponentType<FeatureProps> }) => void) | undefined;
    const load: LazyFeatureLoader<FeatureProps> = vi.fn(() => new Promise<{ default: ComponentType<FeatureProps> }>((resolve) => { resolveLoad = resolve; }));

    render(<LazyFeatureRoute label="Friends" load={load} props={{ value: "loaded" }} screen="friends" requestId={1} onLoadFailed={vi.fn()} />);
    expect(screen.getByTestId("screen-loading")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Loading friends…")).toBeInTheDocument();

    resolveLoad?.({ default: Feature });
    await waitFor(() => expect(screen.getByTestId("loaded-feature")).toHaveTextContent("loaded"));
  });

  it("shows an accessible retry state after a failed feature chunk", async () => {
    const load: LazyFeatureLoader<FeatureProps> = vi.fn()
      .mockRejectedValueOnce(new Error("feature chunk unavailable"))
      .mockResolvedValueOnce({ default: Feature });
    const onLoadFailed = vi.fn();

    render(<LazyFeatureRoute label="Friends" load={load} props={{ value: "retried" }} screen="friends" requestId={4} onLoadFailed={onLoadFailed} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("feature chunk unavailable")).toBeInTheDocument();
    expect(onLoadFailed).toHaveBeenCalledWith(4, "feature chunk unavailable");

    await userEvent.click(screen.getByRole("button", { name: "Retry friends" }));
    await waitFor(() => expect(screen.getByTestId("loaded-feature")).toHaveTextContent("retried"));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
