import { Settings } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Settings as SettingsIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes"

interface SettingsDialogProps extends DebuggableComponentProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
}

export function SettingsDialog({ settings, onSettingsChange, debugId }: SettingsDialogProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "settings-dialog";

  return (
    <Dialog debugId={resolvedDebugId}>
      <DialogTrigger debugId={`${resolvedDebugId}-trigger`} asChild>
        <Button
          debugId={`${resolvedDebugId}-trigger-button`}
          variant="secondary"
          size="icon"
          className="h-11 w-11 rounded-full border border-border bg-background text-primary transition hover:bg-muted"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        debugId={`${resolvedDebugId}-content`}
        className="sm:max-w-md border border-border bg-card text-muted-foreground shadow-sm"
      >
        <DialogHeader debugId={`${resolvedDebugId}-header`}>
          <DialogTitle debugId={`${resolvedDebugId}-title`} className="text-foreground">
            Settings
          </DialogTitle>
        </DialogHeader>
        <div
          {...getDevAttributes("settings-dialog-content", resolvedDebugId)}
          className="space-y-4 py-4"
        >
          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-level-label`} htmlFor="level">
              Language Level
            </Label>
            <Select
              value={settings.level}
              onValueChange={(value: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2') =>
                onSettingsChange({ ...settings, level: value })
              }
            >
              <SelectTrigger debugId={`${resolvedDebugId}-level-trigger`} className="w-32">
                <SelectValue debugId={`${resolvedDebugId}-level-value`} placeholder="Select level" />
              </SelectTrigger>
              <SelectContent debugId={`${resolvedDebugId}-level-menu`}>
                <SelectItem debugId={`${resolvedDebugId}-level-a1`} value="A1">
                  A1
                </SelectItem>
                <SelectItem debugId={`${resolvedDebugId}-level-a2`} value="A2">
                  A2
                </SelectItem>
                <SelectItem debugId={`${resolvedDebugId}-level-b1`} value="B1">
                  B1
                </SelectItem>
                <SelectItem debugId={`${resolvedDebugId}-level-b2`} value="B2">
                  B2
                </SelectItem>
                <SelectItem debugId={`${resolvedDebugId}-level-c1`} value="C1">
                  C1
                </SelectItem>
                <SelectItem debugId={`${resolvedDebugId}-level-c2`} value="C2">
                  C2
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-hints-label`} htmlFor="hints">
              Show Hints
            </Label>
            <Switch
              id="hints"
              debugId={`${resolvedDebugId}-hints-switch`}
              checked={settings.showHints}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showHints: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-examples-label`} htmlFor="examples">
              Show Example Sentences
            </Label>
            <Switch
              id="examples"
              debugId={`${resolvedDebugId}-examples-switch`}
              checked={settings.showExamples}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showExamples: checked })
              }
            />
          </div>

          <div className="flex justify-end pt-4">
            <DialogClose debugId={`${resolvedDebugId}-close`} asChild>
              <Button debugId={`${resolvedDebugId}-save`} className="rounded-full px-5">
                Save changes
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
