const STYLE_ID = "ui-token-test-style";

export function ensureTokenStyles() {
  if (typeof document === "undefined") return;

  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .bg-card { background-color: rgba(255, 255, 255, 1); }
    .bg-popover { background-color: rgba(250, 250, 250, 1); }
    .text-card-foreground { color: rgba(25, 25, 25, 1); }
    .text-popover-foreground { color: rgba(25, 25, 25, 1); }
    .border-border { border-color: rgba(200, 200, 200, 1); }
    .z-overlay { z-index: 50; }
    .z-modal { z-index: 60; }
    .z-popover { z-index: 70; }
  `;

  document.head.append(style);
}
