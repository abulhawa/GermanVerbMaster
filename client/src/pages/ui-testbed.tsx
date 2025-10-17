import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";

const UI_TESTBED_IDS = {
  page: "ui-testbed-page",
  dialogSection: "ui-testbed-dialog-section",
  popoverSection: "ui-testbed-popover-section",
  dropdownSection: "ui-testbed-dropdown-section",
  controlsSection: "ui-testbed-controls-section",
  dialogTrigger: "ui-testbed-dialog-trigger",
  popoverTrigger: "ui-testbed-popover-trigger",
  menuTrigger: "ui-testbed-menu-trigger",
  switchControl: "ui-testbed-switch-control",
  toggleControl: "ui-testbed-toggle-control",
} as const;

export default function UITestbedPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selection, setSelection] = useState("none");
  const [switchOn, setSwitchOn] = useState(false);
  const [toggleOn, setToggleOn] = useState(false);

  return (
    <div
      className="min-h-screen space-y-10 bg-background p-10 text-foreground"
      data-testid="ui-testbed"
      id={UI_TESTBED_IDS.page}
    >
      <section className="space-y-4" data-testid="dialog-section" id={UI_TESTBED_IDS.dialogSection}>
        <h1 className="text-2xl font-semibold">Dialog</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="dialog-trigger" id={UI_TESTBED_IDS.dialogTrigger}>
              Launch dialog
            </Button>
          </DialogTrigger>
          <DialogContent
            data-testid="dialog-content"
            aria-labelledby="testbed-dialog-title"
            aria-describedby="testbed-dialog-description"
          >
            <DialogTitle id="testbed-dialog-title">Share progress</DialogTitle>
            <DialogDescription id="testbed-dialog-description">
              Generate a summary of your recent sessions.
            </DialogDescription>
            <label className="sr-only" htmlFor="recipient">
              Recipient email
            </label>
            <input id="recipient" placeholder="team@example.com" className="w-full border border-border p-2" />
            <Button type="button">Send</Button>
          </DialogContent>
        </Dialog>
      </section>

      <section className="space-y-4" data-testid="popover-section" id={UI_TESTBED_IDS.popoverSection}>
        <h2 className="text-2xl font-semibold">Popover</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button data-testid="popover-trigger" id={UI_TESTBED_IDS.popoverTrigger}>
              Show shortcuts
            </Button>
          </PopoverTrigger>
          <PopoverContent
            data-testid="popover-content"
            role="dialog"
            aria-labelledby="testbed-popover-title"
            aria-describedby="testbed-popover-description"
          >
            <h3 id="testbed-popover-title" className="text-lg font-semibold">
              Keyboard shortcuts
            </h3>
            <p id="testbed-popover-description">
              Use ⌘K to open the command menu anywhere.
            </p>
            <Button type="button" variant="secondary">
              View documentation
            </Button>
          </PopoverContent>
        </Popover>
      </section>

      <section className="space-y-4" data-testid="dropdown-section" id={UI_TESTBED_IDS.dropdownSection}>
        <h2 className="text-2xl font-semibold">Dropdown menu</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="menu-trigger" id={UI_TESTBED_IDS.menuTrigger}>
              Menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="menu-content">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSelection("profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSelection("billing")}>Billing</DropdownMenuItem>
            <DropdownMenuItem disabled onSelect={() => setSelection("disabled")}>Disabled</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p data-testid="menu-selection">Last selection: {selection}</p>
      </section>

      <section className="space-y-4" data-testid="controls-section" id={UI_TESTBED_IDS.controlsSection}>
        <h2 className="text-2xl font-semibold">Controls</h2>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              data-testid="testbed-switch"
              aria-label="Dark mode"
              checked={switchOn}
              onCheckedChange={setSwitchOn}
              id={UI_TESTBED_IDS.switchControl}
            />
            <span>{switchOn ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle
              data-testid="testbed-toggle"
              aria-label="Notifications"
              pressed={toggleOn}
              onPressedChange={setToggleOn}
              id={UI_TESTBED_IDS.toggleControl}
            >
              Notifications
            </Toggle>
            <span>{toggleOn ? "On" : "Off"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
