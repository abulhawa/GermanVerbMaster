// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Button } from "../button";
import { ensureTokenStyles } from "./test-utils";

function DropdownExample({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="menu-trigger">Open menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="menu-content">
        <DropdownMenuLabel>Profile</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSelect("profile")}>Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("billing")}>
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem disabled onSelect={() => onSelect("disabled")}>
          Disabled
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

beforeEach(() => {
  ensureTokenStyles();
});

describe("Dropdown menu", () => {
  it("opens via keyboard, cycles with arrows, and selects with Enter", async () => {
    const onSelect = vi.fn();
    render(<DropdownExample onSelect={onSelect} />);
    const user = userEvent.setup();

    const trigger = screen.getByTestId("menu-trigger");
    trigger.focus();

    await user.keyboard("{ArrowDown}");

    const menu = await screen.findByTestId("menu-content");
    expect(menu).toBeVisible();
    expect(menu.className).toContain("bg-popover");
    expect(menu.className).toContain("border-border");

    let active = document.activeElement as HTMLElement;
    expect(active.textContent).toContain("Profile");

    await user.keyboard("{ArrowDown}");
    active = document.activeElement as HTMLElement;
    expect(active.textContent).toContain("Billing");

    await user.keyboard("{ArrowDown}");
    active = document.activeElement as HTMLElement;
    expect(active.textContent).toContain("Billing");

    await user.keyboard("{ArrowUp}");
    active = document.activeElement as HTMLElement;
    expect(active.textContent).toContain("Profile");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("profile"));
    await waitFor(() =>
      expect(screen.queryByTestId("menu-content")).not.toBeInTheDocument()
    );
  });

  it("ignores clicks on disabled items", async () => {
    const onSelect = vi.fn();
    render(<DropdownExample onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("menu-trigger"));
    await screen.findByTestId("menu-content");

    const disabledItem = screen.getByText("Disabled");
    await user.click(disabledItem);

    expect(onSelect).not.toHaveBeenCalledWith("disabled");
  });
});
