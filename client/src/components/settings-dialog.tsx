import { useEffect, useState } from 'react';

import type { PracticeSettingsState, TaskType, CEFRLevel } from '@shared';
import { useTranslations } from '@/locales';

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

import { Monitor, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';

import {
  updateCefrLevel,
  updateB2ExamMode,
  updateRendererPreferences,
} from '@/lib/practice-settings';

import { type ThemeSetting } from '@/lib/theme';
import { useTheme } from 'next-themes';
import {
  consumeQueuedPracticeSettingsOpen,
  PRACTICE_SETTINGS_OPEN_EVENT,
} from '@/lib/practice-settings-events';

import { getTaskTypeCopy } from '@/lib/task-metadata';

interface SettingsDialogProps extends DebuggableComponentProps {
  settings: PracticeSettingsState;

  onSettingsChange: (settings: PracticeSettingsState) => void;

  taskType?: TaskType;

  presetLabel?: string;

  taskTypeLabel?: string;

  showTrigger?: boolean;
}

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const B2_EXAM_DATE = new Date('2026-04-30');

function toDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function computeDaysUntil(examDate: Date): number {
  const today = toDateOnly(new Date());
  const target = toDateOnly(examDate);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((message, [token, value]) => {
    return message.replaceAll(`{${token}}`, value);
  }, template);
}

export function SettingsDialog({
  settings,

  onSettingsChange,

  debugId,

  taskType = 'conjugate_form',

  presetLabel,

  taskTypeLabel,

  showTrigger = true,
}: SettingsDialogProps) {
  const translations = useTranslations();
  const b2Copy = translations.settingsDialog.b2ExamMode;
  const resolvedDebugId =
    debugId && debugId.trim().length > 0 ? debugId : 'settings-dialog';

  const prefs = settings.rendererPreferences[taskType] ?? {
    showHints: true,
    showExamples: false,
  };

  const cefrLevel =
    settings.cefrLevelByPos.verb ?? settings.legacyVerbLevel ?? 'A1';

  const taskCopy = getTaskTypeCopy(taskType);

  const activePresetLabel = presetLabel ?? 'Verbs only';

  const activeTaskLabel = taskTypeLabel ?? taskCopy.label;

  const { theme, setTheme } = useTheme();
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>('system');
  const [hasMountedTheme, setHasMountedTheme] = useState(false);
  const [open, setOpen] = useState(false);
  const daysUntilExam = computeDaysUntil(B2_EXAM_DATE);

  const handleLevelChange = (level: CEFRLevel) => {
    const next = updateCefrLevel(settings, { pos: 'verb', level });

    onSettingsChange(next);
  };

  const handlePreferenceChange = (
    field: 'showHints' | 'showExamples',
    value: boolean,
  ) => {
    const next = updateRendererPreferences(settings, {
      taskType,

      preferences: { [field]: value },
    });

    onSettingsChange(next);
  };

  const handleB2ExamModeChange = (enabled: boolean) => {
    const next = updateB2ExamMode(settings, enabled);
    onSettingsChange(next);
  };

  useEffect(() => {
    setHasMountedTheme(true);
  }, []);

  useEffect(() => {
    if (!theme) {
      return;
    }
    setThemeSetting(theme as ThemeSetting);
  }, [theme]);

  useEffect(() => {
    if (consumeQueuedPracticeSettingsOpen()) {
      setOpen(true);
    }

    if (typeof window === 'undefined') {
      return;
    }

    const handleExternalOpen = () => setOpen(true);
    window.addEventListener(PRACTICE_SETTINGS_OPEN_EVENT, handleExternalOpen);

    return () => {
      window.removeEventListener(
        PRACTICE_SETTINGS_OPEN_EVENT,
        handleExternalOpen,
      );
    };
  }, []);

  const handleThemeChange = (next: ThemeSetting | '') => {
    if (!next) {
      return;
    }

    setThemeSetting(next);

    setTheme(next);
  };

  return (
    <Dialog debugId={resolvedDebugId} open={open} onOpenChange={setOpen}>
      {showTrigger ? (
        <DialogTrigger debugId={`${resolvedDebugId}-trigger`} asChild>
          <Button
            debugId={`${resolvedDebugId}-trigger-button`}
            variant="secondary"
            size="icon"
            className="h-11 w-11 rounded-full border border-border bg-background text-primary transition hover:bg-muted"
            aria-label="Open practice settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent
        debugId={`${resolvedDebugId}-content`}
        className="sm:max-w-md border border-border bg-card text-muted-foreground shadow-sm"
      >
        <DialogHeader debugId={`${resolvedDebugId}-header`}>
          <DialogTitle
            debugId={`${resolvedDebugId}-title`}
            className="text-foreground"
          >
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

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Appearance
            </p>
            <ToggleGroup
              type="single"
              aria-label="Select theme"
              value={hasMountedTheme ? themeSetting : 'system'}
              onValueChange={(value) =>
                handleThemeChange(value as ThemeSetting | '')
              }
              className="flex w-full gap-2"
              debugId={`${resolvedDebugId}-theme-toggle-group`}
            >
              <ToggleGroupItem
                value="light"
                variant="outline"
                size="lg"
                className="flex-1 gap-2 rounded-full"
                debugId={`${resolvedDebugId}-theme-light`}
              >
                <Sun className="h-4 w-4" aria-hidden />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dark"
                variant="outline"
                size="lg"
                className="flex-1 gap-2 rounded-full"
                debugId={`${resolvedDebugId}-theme-dark`}
              >
                <Moon className="h-4 w-4" aria-hidden />
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem
                value="system"
                variant="outline"
                size="lg"
                className="flex-1 gap-2 rounded-full"
                debugId={`${resolvedDebugId}-theme-system`}
              >
                <Monitor className="h-4 w-4" aria-hidden />
                System
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground/80">
              Theme adjusts automatically when set to System.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-level-label`} htmlFor="level">
              Verb level (CEFR)
            </Label>

            <Select
              value={cefrLevel}
              onValueChange={(value: CEFRLevel) => handleLevelChange(value)}
            >
              <SelectTrigger
                debugId={`${resolvedDebugId}-level-trigger`}
                className="w-32"
              >
                <SelectValue
                  debugId={`${resolvedDebugId}-level-value`}
                  placeholder="Select level"
                />
              </SelectTrigger>

              <SelectContent debugId={`${resolvedDebugId}-level-menu`}>
                {LEVELS.map((level) => (
                  <SelectItem
                    key={level}
                    debugId={`${resolvedDebugId}-level-${level.toLowerCase()}`}
                    value={level}
                  >
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label debugId={`${resolvedDebugId}-translations-label`} htmlFor="translations">
              Show translations
            </Label>

            <Switch
              id="translations"
              debugId={`${resolvedDebugId}-translations-switch`}
              checked={prefs.showHints}
              onCheckedChange={(checked) =>
                handlePreferenceChange('showHints', checked)
              }
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-warning-border/70 bg-warning-muted p-4">
            <div className="space-y-1">
              <Label debugId={`${resolvedDebugId}-b2-label`} htmlFor="b2-exam-mode">
                {b2Copy.label}
              </Label>
              <p className="text-xs text-warning-muted-foreground">
                {b2Copy.description}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Switch
                id="b2-exam-mode"
                debugId={`${resolvedDebugId}-b2-switch`}
                checked={settings.b2ExamMode}
                onCheckedChange={handleB2ExamModeChange}
              />
              {settings.b2ExamMode && daysUntilExam >= 0 ? (
                <span className="text-xs font-semibold text-warning-strong">
                  {formatTemplate(b2Copy.countdown, { days: String(daysUntilExam) })}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label
              debugId={`${resolvedDebugId}-examples-label`}
              htmlFor="examples"
            >
              Show examples
            </Label>

            <Switch
              id="examples"
              debugId={`${resolvedDebugId}-examples-switch`}
              checked={prefs.showExamples}
              onCheckedChange={(checked) =>
                handlePreferenceChange('showExamples', checked)
              }
            />
          </div>

          <div className="flex justify-end pt-4">
            <DialogClose debugId={`${resolvedDebugId}-close`} asChild>
              <Button
                debugId={`${resolvedDebugId}-save`}
                className="rounded-full px-5"
              >
                Save changes
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
