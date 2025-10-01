import { expect, test, type Page } from "@playwright/test";

const dialogContent = "[data-testid=dialog-content]";
const dialogTrigger = "[data-testid=dialog-trigger]";
const popoverContent = "[data-testid=popover-content]";
const popoverTrigger = "[data-testid=popover-trigger]";
const menuTrigger = "[data-testid=menu-trigger]";
const menuContent = "[data-testid=menu-content]";
const switchControl = "[data-testid=testbed-switch]";
const toggleControl = "[data-testid=testbed-toggle]";

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
});
