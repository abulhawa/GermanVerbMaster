// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../switch";
import { Toggle } from "../toggle";
import { ensureTokenStyles } from "./test-utils";

function SwitchToggleExample() {
  return (
    <div className="space-y-4">
      <Switch aria-label="airplane mode" data-testid="switch" />
      <Toggle aria-label="bold" data-testid="toggle">
        Bold
      </Toggle>
    </div>
  );
}

beforeEach(() => {
  ensureTokenStyles();
});

describe("Switch and Toggle", () => {
  it("toggle checked state via click and keyboard", async () => {
    render(<SwitchToggleExample />);
    const user = userEvent.setup();

    const switchControl = screen.getByTestId("switch");
    expect(switchControl).toHaveAttribute("role", "switch");
    expect(switchControl).toHaveAttribute("aria-checked", "false");

    await user.click(switchControl);
    expect(switchControl).toHaveAttribute("aria-checked", "true");

    switchControl.focus();
    await user.keyboard("[Space]");
    expect(switchControl).toHaveAttribute("aria-checked", "false");

    const toggleControl = screen.getByTestId("toggle");
    expect(toggleControl).toHaveAttribute("role", "switch");
    expect(toggleControl).toHaveAttribute("aria-checked", "false");

    await user.click(toggleControl);
    expect(toggleControl).toHaveAttribute("aria-checked", "true");

    toggleControl.focus();
    await user.keyboard("[Space]");
    expect(toggleControl).toHaveAttribute("aria-checked", "false");
  });
});
