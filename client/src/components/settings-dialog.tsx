import { Settings } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SettingsDialogProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsDialog({ settings, onSettingsChange }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="level">Language Level</Label>
            <Select
              value={settings.level}
              onValueChange={(value: 'A1' | 'A2') => 
                onSettingsChange({ ...settings, level: value })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A1">A1</SelectItem>
                <SelectItem value="A2">A2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="hints">Show Hints</Label>
            <Switch
              id="hints"
              checked={settings.showHints}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showHints: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="examples">Show Example Sentences</Label>
            <Switch
              id="examples"
              checked={settings.showExamples}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showExamples: checked })
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
