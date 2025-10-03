import type { PracticeSettingsState, TaskType, CEFRLevel } from '@shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';
import {
  updateCefrLevel,
  updateRendererPreferences,
} from '@/lib/practice-settings';
import { getTaskTypeCopy } from '@/lib/task-metadata';

interface SettingsDialogProps extends DebuggableComponentProps {
  settings: PracticeSettingsState;
  onSettingsChange: (settings: PracticeSettingsState) => void;
  taskType?: TaskType;
  presetLabel?: string;
  taskTypeLabel?: string;
}

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export function SettingsDialog({
  settings,
  onSettingsChange,
  debugId,
  taskType = 'conjugate_form',
  presetLabel,
  taskTypeLabel,
}: SettingsDialogProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'settings-dialog';
  const prefs = settings.rendererPreferences[taskType] ?? { showHints: true, showExamples: true };
  const cefrLevel = settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';
  const taskCopy = getTaskTypeCopy(taskType);
  const activePresetLabel = presetLabel ?? 'Verbs only';
  const activeTaskLabel = taskTypeLabel ?? taskCopy.label;

  const handleLevelChange = (level: CEFRLevel) => {
    const next = updateCefrLevel(settings, { pos: 'verb', level });
    onSettingsChange(next);
  };

  const handlePreferenceChange = (field: 'showHints' | 'showExamples', value: boolean) => {
    const next = updateRendererPreferences(settings, {
      taskType,
      preferences: { [field]: value },
    });
    onSettingsChange(next);
  };

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
            Practice settings
          </DialogTitle>
        </DialogHeader>
        <div
          {...getDevAttributes('settings-dialog-content', resolvedDebugId)}
          className="space-y-4 py-4"
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Active preset
            </p>
            <p className="text-sm text-foreground">
              {activePresetLabel} · {activeTaskLabel}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-level-label`} htmlFor="level">
              Verb level (CEFR)
            </Label>
            <Select value={cefrLevel} onValueChange={(value: CEFRLevel) => handleLevelChange(value)}>
              <SelectTrigger debugId={`${resolvedDebugId}-level-trigger`} className="w-32">
                <SelectValue debugId={`${resolvedDebugId}-level-value`} placeholder="Select level" />
              </SelectTrigger>
              <SelectContent debugId={`${resolvedDebugId}-level-menu`}>
                {LEVELS.map((level) => (
                  <SelectItem key={level} debugId={`${resolvedDebugId}-level-${level.toLowerCase()}`} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-hints-label`} htmlFor="hints">
              Show hints
            </Label>
            <Switch
              id="hints"
              debugId={`${resolvedDebugId}-hints-switch`}
              checked={prefs.showHints}
              onCheckedChange={(checked) => handlePreferenceChange('showHints', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-examples-label`} htmlFor="examples">
              Show examples
            </Label>
            <Switch
              id="examples"
              debugId={`${resolvedDebugId}-examples-switch`}
              checked={prefs.showExamples}
              onCheckedChange={(checked) => handlePreferenceChange('showExamples', checked)}
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
  );
}

