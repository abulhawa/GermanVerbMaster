import { expect, test } from "@playwright/test";

function parseAlpha(color: string): number {
  if (color.startsWith("rgba")) {
    const alpha = Number(color.replace(/.*,(.*)\)/, "$1").trim());
    return Number.isNaN(alpha) ? 1 : alpha;
  }

  return 1;
}

function parseZIndex(value: string): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

test.describe("overlay guardrails", () => {
  test("select dropdown stays opaque and above sticky headers", async ({ page }) => {
    await page.addStyleTag({ content: "*, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }" });

    await page.goto("/admin");

    const tableHeader = page.locator("table thead").first();
    await tableHeader.waitFor();

    const posTrigger = page.getByRole("combobox").first();
    await posTrigger.click();

    const dropdown = page.getByRole("listbox");
    await expect(dropdown).toBeVisible();

    const backgroundColor = await dropdown.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(parseAlpha(backgroundColor)).toBeGreaterThanOrEqual(0.99);

    const dropdownZ = parseZIndex(
      await dropdown.evaluate(element => getComputedStyle(element).zIndex)
    );
    const headerZ = parseZIndex(
      await tableHeader.evaluate(element => getComputedStyle(element).zIndex)
    );
    expect(dropdownZ).toBeGreaterThan(headerZ);

    await expect(dropdown).toHaveScreenshot("pos-dropdown.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  });
});
