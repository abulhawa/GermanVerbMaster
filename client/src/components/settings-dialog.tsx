import { Settings } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
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
        <Button
          variant="secondary"
          size="icon"
          className="h-11 w-11 rounded-full border border-white/10 bg-white/10 text-slate-100 transition hover:bg-white/20"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border border-white/10 bg-white/[0.08] text-foreground shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="level">Language Level</Label>
            <Select
              value={settings.level}
              onValueChange={(value: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2') => 
                onSettingsChange({ ...settings, level: value })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A1">A1</SelectItem>
                <SelectItem value="A2">A2</SelectItem>
                <SelectItem value="B1">B1</SelectItem>
                <SelectItem value="B2">B2</SelectItem>
                <SelectItem value="C1">C1</SelectItem>
                <SelectItem value="C2">C2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="hints">Show Hints</Label>
            <Switch
              id="hints"
              checked={settings.showHints}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showHints: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="examples">Show Example Sentences</Label>
            <Switch
              id="examples"
              checked={settings.showExamples}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, showExamples: checked })
              }
            />
          </div>

          <div className="flex justify-end pt-4">
            <DialogClose asChild>
              <Button className="rounded-full px-5">Save changes</Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}