// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../dialog";
import { Button } from "../button";
import { ensureTokenStyles } from "./test-utils";

function SettingsLevelSelect() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-testid="open-settings">Open settings</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Update your language practice preferences.
        </DialogDescription>
        <Select defaultValue="A1">
          <SelectTrigger className="w-32" aria-label="Language level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-testid="level-select-content">
            <SelectItem value="A1">A1</SelectItem>
            <SelectItem value="A2">A2</SelectItem>
            <SelectItem value="B1">B1</SelectItem>
            <SelectItem value="B2">B2</SelectItem>
            <SelectItem value="C1">C1</SelectItem>
            <SelectItem value="C2">C2</SelectItem>
          </SelectContent>
        </Select>
      </DialogContent>
    </Dialog>
  );
}

describe("Select", () => {
  beforeAll(() => {
    const elementProto = window.Element.prototype as unknown as {
      hasPointerCapture?: (pointerId: number) => boolean;
      setPointerCapture?: (pointerId: number) => void;
      releasePointerCapture?: (pointerId: number) => void;
    };

    if (!elementProto.hasPointerCapture) {
      elementProto.hasPointerCapture = () => false;
    }

    if (!elementProto.setPointerCapture) {
      elementProto.setPointerCapture = () => {};
    }

    if (!elementProto.releasePointerCapture) {
      elementProto.releasePointerCapture = () => {};
    }

    if (!elementProto.scrollIntoView) {
      elementProto.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    ensureTokenStyles();
  });

  it("renders options inside the dialog and updates the selected value", async () => {
    render(<SettingsLevelSelect />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-settings"));
    await screen.findByRole("dialog");

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("A1");

    await user.click(trigger);

    const option = await screen.findByRole("option", { name: "B2" });
    await user.click(option);

    expect(trigger).toHaveTextContent("B2");
  });

  it("applies the popover z-index token so the list renders above the dialog overlay", async () => {
    render(<SettingsLevelSelect />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-settings"));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("combobox"));

    const content = (await screen.findByRole("listbox")) as HTMLElement;

    const overlay = document.querySelector(
      ".z-overlay[data-state='open']"
    ) as HTMLElement | null;
    expect(overlay).toBeTruthy();

    expect(content.className).toContain("z-popover");

    const contentZ = Number(getComputedStyle(content).zIndex);
    const overlayZ = Number(
      overlay ? getComputedStyle(overlay).zIndex : Number.NEGATIVE_INFINITY
    );

    expect(contentZ).toBeGreaterThan(overlayZ);
  });
});
