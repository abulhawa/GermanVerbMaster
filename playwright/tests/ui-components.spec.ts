import { expect, test, type Locator, type Page } from "@playwright/test";

const dialogSection = "[data-testid=dialog-section]";
const dialogContent = "[data-testid=dialog-content]";
const dialogTrigger = "[data-testid=dialog-trigger]";
const popoverSection = "[data-testid=popover-section]";
const popoverContent = "[data-testid=popover-content]";
const popoverTrigger = "[data-testid=popover-trigger]";
const dropdownSection = "[data-testid=dropdown-section]";
const menuTrigger = "[data-testid=menu-trigger]";
const menuContent = "[data-testid=menu-content]";
const controlsSection = "[data-testid=controls-section]";
const switchControl = "[data-testid=testbed-switch]";
const toggleControl = "[data-testid=testbed-toggle]";

type ContrastCheckOptions = {
  minContrastRatio?: number;
};

type ContrastCheckResult = {
  contrastRatio: number;
  color: string;
  background: string;
  width: number;
  height: number;
  textContent: string;
};

async function expectLocatorToBeLegible(
  locator: Locator,
  { minContrastRatio = 1.5 }: ContrastCheckOptions = {},
) {
  await expect(locator).toBeVisible();

  const result = await locator.evaluate<ContrastCheckResult>((element) => {
    const parseColor = (value: string) => {
      if (!value) {
        return null;
      }
      if (value === "transparent") {
        return { r: 0, g: 0, b: 0, a: 0 } as const;
      }

      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (!match) {
        return null;
      }

      const parts = match[1].split(",").map((part) => part.trim());
      const r = Number.parseFloat(parts[0] ?? "0");
      const g = Number.parseFloat(parts[1] ?? "0");
      const b = Number.parseFloat(parts[2] ?? "0");
      const a = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;

      if ([r, g, b, a].some((channel) => Number.isNaN(channel))) {
        return null;
      }

      return { r, g, b, a } as const;
    };

    const toLuminance = (color: { r: number; g: number; b: number }) => {
      const transform = (value: number) => {
        const srgb = value / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
      };

      const r = transform(color.r);
      const g = transform(color.g);
      const b = transform(color.b);

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const getEffectiveBackground = (node: Element | null): { r: number; g: number; b: number; a: number } => {
      let current: Element | null = node;

      while (current) {
        const style = window.getComputedStyle(current);
        const parsed = parseColor(style.backgroundColor);
        if (parsed && parsed.a > 0) {
          return parsed as { r: number; g: number; b: number; a: number };
        }
        current = current.parentElement;
      }

      const fallback = parseColor(window.getComputedStyle(document.body).backgroundColor);
      if (fallback) {
        return fallback as { r: number; g: number; b: number; a: number };
      }

      return { r: 255, g: 255, b: 255, a: 1 };
    };

    const elementStyle = window.getComputedStyle(element);
    const textColor = parseColor(elementStyle.color);
    if (!textColor) {
      throw new Error(`Unable to parse color value: ${elementStyle.color}`);
    }

    const background = getEffectiveBackground(element);

    const luminanceText = toLuminance(textColor);
    const luminanceBackground = toLuminance(background);

    const lighter = Math.max(luminanceText, luminanceBackground);
    const darker = Math.min(luminanceText, luminanceBackground);
    const contrastRatio = (lighter + 0.05) / (darker + 0.05);

    const rect = element.getBoundingClientRect();

    return {
      contrastRatio,
      color: `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a})`,
      background: `rgba(${background.r}, ${background.g}, ${background.b}, ${background.a})`,
      width: rect.width,
      height: rect.height,
      textContent: element.textContent ?? "",
    } satisfies ContrastCheckResult;
  });

  const trimmed = result.textContent.trim();
  expect(trimmed.length).toBeGreaterThan(0);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  if (result.contrastRatio < minContrastRatio) {
    throw new Error(
      `Contrast ratio ${result.contrastRatio.toFixed(2)} for "${trimmed}" with color ${result.color} on background ${result.background}`,
    );
  }
}

async function openTestbed(page: Page) {
  await page.goto("/ui-testbed");
  await expect(page.locator("[data-testid=ui-testbed]")).toBeVisible();
}

test.describe("UI component regressions", () => {
  test.beforeEach(async ({ page }) => {
    await openTestbed(page);
  });

  test("dialog layering, focus, and background integrity", async ({ page }) => {
    await page.click(dialogTrigger);
    const dialog = page.locator(dialogContent);
    await expect(dialog).toBeVisible();

    const background = await dialog.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    const overlayZ = await page
      .locator('[data-aria-hidden="true"][data-state="open"]').first()
      .evaluate(el => {
        const value = window.getComputedStyle(el).zIndex;
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      });
    const contentZ = await dialog.evaluate(el => {
      const value = window.getComputedStyle(el).zIndex;
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
    expect(contentZ).toBeGreaterThan(overlayZ);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("dropdown menu arrow navigation and selection", async ({ page }) => {
    await page.focus(menuTrigger);
    await page.keyboard.press("ArrowDown");

    const menu = page.locator(menuContent);
    await expect(menu).toBeVisible();

    const activeText = () =>
      page.evaluate(() => document.activeElement?.textContent ?? "");

    await expect.poll(activeText).toContain("Profile");
    await page.keyboard.press("ArrowDown");
    await expect.poll(activeText).toContain("Billing");
    await page.keyboard.press("ArrowUp");
    await expect.poll(activeText).toContain("Profile");
    await page.keyboard.press("Enter");

    await expect(menu).toBeHidden();
    await expect(page.locator("[data-testid=menu-selection]")).toHaveText(
      /profile/i
    );
  });

  test("popover background and dismissal", async ({ page }) => {
    await page.click(popoverTrigger);
    const popover = page.locator(popoverContent);
    await expect(popover).toBeVisible();

    const background = await popover.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    await page.mouse.click(10, 10);
    await expect(popover).toBeHidden();
  });

  test("switch and toggle respond to pointer and keyboard", async ({ page }) => {
    const switchLocator = page.locator(switchControl);
    await switchLocator.click();
    await expect(switchLocator).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await switchLocator.press("Space");
    await expect(switchLocator).toHaveAttribute(
      "aria-checked",
      "false"
    );

    await page.click(toggleControl);
    await expect(page.locator(toggleControl)).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await page.locator(toggleControl).press("Space");
    await expect(page.locator(toggleControl)).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  test("all UI testbed components display legible text", async ({ page }) => {
    await expect(page.locator(dialogSection)).toBeVisible();
    await expectLocatorToBeLegible(page.getByRole("heading", { name: "Dialog" }));
    await expectLocatorToBeLegible(page.getByRole("button", { name: "Launch dialog" }));

    await page.click(dialogTrigger);
    await expectLocatorToBeLegible(page.getByRole("heading", { name: "Share progress" }));
    await expectLocatorToBeLegible(
      page.getByText("Generate a summary of your recent sessions.")
    );
    await expectLocatorToBeLegible(page.getByRole("button", { name: "Send" }));
    await page.keyboard.press("Escape");

    await expect(page.locator(popoverSection)).toBeVisible();
    await expectLocatorToBeLegible(page.getByRole("heading", { name: "Popover" }));
    await expectLocatorToBeLegible(page.getByRole("button", { name: "Show shortcuts" }));

    await page.click(popoverTrigger);
    await expectLocatorToBeLegible(page.getByRole("heading", { name: "Keyboard shortcuts" }));
    await expectLocatorToBeLegible(
      page.getByText("Use ⌘K to open the command menu anywhere.")
    );
    await expectLocatorToBeLegible(page.getByRole("button", { name: "View documentation" }));
    await page.mouse.click(10, 10);

    await expect(page.locator(dropdownSection)).toBeVisible();
    await expectLocatorToBeLegible(page.getByRole("heading", { name: "Dropdown menu" }));
    await expectLocatorToBeLegible(page.getByRole("button", { name: "Menu" }));

    await page.click(menuTrigger);
    await expectLocatorToBeLegible(page.getByText("Account"));
    await expectLocatorToBeLegible(page.getByRole("menuitem", { name: "Profile" }));
    await expectLocatorToBeLegible(page.getByRole("menuitem", { name: "Billing" }));
    await expectLocatorToBeLegible(page.getByRole("menuitem", { name: "Disabled" }));
    await expectLocatorToBeLegible(
      page.locator("[data-testid=menu-selection]")
    );
    await page.keyboard.press("Escape");

    await expect(page.locator(controlsSection)).toBeVisible();
    const controlsArea = page.locator(controlsSection);
    await expectLocatorToBeLegible(controlsArea.getByRole("heading", { name: "Controls" }));
    await expectLocatorToBeLegible(controlsArea.getByText("Disabled", { exact: true }));
    await expectLocatorToBeLegible(controlsArea.getByRole("switch", { name: "Notifications" }));
    await expectLocatorToBeLegible(controlsArea.getByText("Off", { exact: true }));
  });
});
