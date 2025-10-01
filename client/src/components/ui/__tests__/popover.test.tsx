// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Button } from "../button";
import { ensureTokenStyles } from "./test-utils";

function PopoverExample() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button data-testid="popover-trigger">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-labelledby="popover-title"
        aria-describedby="popover-description"
        data-testid="popover-content"
      >
        <h2 id="popover-title" className="text-lg font-semibold">
          Quick actions
        </h2>
        <p id="popover-description">Shortcuts that work anywhere.</p>
        <Button type="button">Run command</Button>
      </PopoverContent>
    </Popover>
  );
}

beforeEach(() => {
  ensureTokenStyles();
});

describe("Popover", () => {
  it("opens via click and keyboard and closes on Escape/outside click", async () => {
    render(<PopoverExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("popover-trigger"));
    let popover = await screen.findByTestId("popover-content");

    expect(popover).toBeVisible();
    expect(popover).toHaveAttribute("role", "dialog");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("popover-content")).not.toBeInTheDocument()
    );

    const trigger = screen.getByTestId("popover-trigger");
    trigger.focus();
    await user.keyboard("[Space]");

    popover = await screen.findByTestId("popover-content");
    expect(popover).toBeVisible();

    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByTestId("popover-content")).not.toBeInTheDocument()
    );
  });

  it("applies token styling and renders a solid background", async () => {
    render(<PopoverExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("popover-trigger"));
    const popover = await screen.findByTestId("popover-content");

    expect(popover.className).toContain("bg-popover");
    expect(popover.className).toContain("border-border");
    expect(popover.className).toContain("text-popover-foreground");

    const background = getComputedStyle(popover).backgroundColor;
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  });
});
