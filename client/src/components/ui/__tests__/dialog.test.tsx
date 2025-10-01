// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../dialog";
import { Button } from "../button";
import { ensureTokenStyles } from "./test-utils";

function DialogExample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-testid="open-dialog">Open dialog</Button>
      </DialogTrigger>
      <DialogContent
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        data-testid="dialog-content"
      >
        <DialogTitle id="dialog-title">Profile settings</DialogTitle>
        <DialogDescription id="dialog-description">
          Update your personal details below.
        </DialogDescription>
        <label htmlFor="name" className="sr-only">
          Name
        </label>
        <input id="name" name="name" placeholder="Name" />
        <Button type="button">Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}

beforeEach(() => {
  ensureTokenStyles();
});

describe("Dialog", () => {
  it("renders trigger without crashing", () => {
    render(<DialogExample />);

    expect(screen.getByTestId("open-dialog")).toBeInTheDocument();
  });

  it("opens on trigger click and focuses the first focusable element", async () => {
    render(<DialogExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-dialog"));

    const dialog = await screen.findByRole("dialog");
    const focusTarget = screen.getByPlaceholderText("Name");

    await waitFor(() => expect(dialog).toBeVisible());
    expect(document.activeElement).toBe(focusTarget);
    expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "dialog-description");
  });

  it("traps focus with tab navigation", async () => {
    render(<DialogExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-dialog"));
    await screen.findByRole("dialog");

    await user.tab();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByPlaceholderText("Name")).toHaveFocus();
  });

  it("closes on Escape and overlay click", async () => {
    render(<DialogExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-dialog"));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );

    await user.click(screen.getByTestId("open-dialog"));
    await screen.findByRole("dialog");

    const overlay = await waitFor(() => {
      const element = document.querySelector(
        '[data-aria-hidden="true"][data-state="open"]'
      ) as HTMLElement | null;
      expect(element).toBeTruthy();
      return element!;
    });

    await user.click(overlay);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("uses token classes and renders a solid background", async () => {
    render(<DialogExample />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-dialog"));
    const dialog = await screen.findByRole("dialog");

    expect(dialog.className).toContain("bg-card");
    expect(dialog.className).toContain("border-border");
    expect(dialog.className).toContain("text-card-foreground");

    const background = getComputedStyle(dialog).backgroundColor;
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    const overlay = document.querySelector(
      "[data-radix-dialog-overlay]"
    ) as HTMLElement | null;
    const overlayZ = overlay ? getComputedStyle(overlay).zIndex : null;
    const contentZ = getComputedStyle(dialog).zIndex;

    expect(Number(contentZ)).toBeGreaterThan(Number(overlayZ));
  });
});
