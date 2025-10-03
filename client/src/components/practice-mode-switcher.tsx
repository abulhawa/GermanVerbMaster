import { useMemo, useState } from 'react';
import { BookOpen, Flame, PenLine, SlidersHorizontal, Sparkles } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getTaskTypeCopy } from '@/lib/task-metadata';
import type { TaskType } from '@shared';
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';

export type PracticeScope = 'all' | 'verbs' | 'nouns' | 'adjectives' | 'custom';

interface PracticeModeSwitcherProps extends DebuggableComponentProps {
  scope: PracticeScope;
  onScopeChange: (scope: PracticeScope) => void;
  selectedTaskTypes: TaskType[];
  onTaskTypesChange: (taskTypes: TaskType[]) => void;
  availableTaskTypes: ReadonlyArray<TaskType>;
}

interface ModeConfig {
  value: PracticeScope;
  label: string;
  description: string;
  icon: typeof Sparkles;
}

const MODE_CONFIG: ModeConfig[] = [
  {
    value: 'all',
    label: 'All tasks',
    description: 'Blend every available task type in your session.',
    icon: Sparkles,
  },
  {
    value: 'verbs',
    label: 'Verbs',
    description: 'Focus on verb conjugation drills.',
    icon: Flame,
  },
  {
    value: 'nouns',
    label: 'Nouns',
    description: 'Strengthen noun plural and case endings.',
    icon: BookOpen,
  },
  {
    value: 'adjectives',
    label: 'Adjectives',
    description: 'Polish comparative adjective endings.',
    icon: PenLine,
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Use a saved combination of task types.',
    icon: SlidersHorizontal,
  },
];

export function PracticeModeSwitcher({
  scope,
  onScopeChange,
  selectedTaskTypes,
  onTaskTypesChange,
  availableTaskTypes,
  debugId,
}: PracticeModeSwitcherProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-mode-switcher';
  const selectedSet = useMemo(() => new Set(selectedTaskTypes), [selectedTaskTypes]);
  const sortedTaskTypes = useMemo(() => {
    const seen = new Set<TaskType>();
    const ordered: TaskType[] = [];
    for (const taskType of availableTaskTypes) {
      if (seen.has(taskType)) {
        continue;
      }
      seen.add(taskType);
      ordered.push(taskType);
    }
    return ordered;
  }, [availableTaskTypes]);

  const handleScopeChange = (next: PracticeScope | '') => {
    if (!next || next === scope) {
      return;
    }
    onScopeChange(next as PracticeScope);
  };

  const ensureCustomScope = () => {
    if (scope !== 'custom') {
      onScopeChange('custom');
    }
  };

  const handleTaskTypeToggle = (taskType: TaskType, checked: boolean) => {
    const nextSelection = new Set(selectedTaskTypes);

    if (checked) {
      nextSelection.add(taskType);
    } else {
      if (nextSelection.size <= 1) {
        return;
      }
      nextSelection.delete(taskType);
    }

    ensureCustomScope();
    onTaskTypesChange(Array.from(nextSelection));
  };

  const activeMode = MODE_CONFIG.find((mode) => mode.value === scope) ?? MODE_CONFIG[0];

  return (
    <div
      className="space-y-3"
      {...getDevAttributes('practice-mode-switcher', resolvedDebugId)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Practice scope
          </p>
          <p className="text-sm text-muted-foreground">{activeMode.description}</p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-primary/30 bg-primary/10 text-[11px] uppercase tracking-[0.22em] text-primary"
        >
          {selectedTaskTypes.length} selected
        </Badge>
      </div>

      <ToggleGroup
        type="single"
        value={scope}
        onValueChange={(value) => handleScopeChange(value as PracticeScope | '')}
        className="flex flex-wrap gap-2"
      >
        {MODE_CONFIG.map((mode) => (
          <ToggleGroupItem
            key={mode.value}
            value={mode.value}
            aria-label={mode.label}
            className={cn(
              'flex items-center gap-2 rounded-2xl border border-border/60 bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
            )}
          >
            <mode.icon className="h-4 w-4" aria-hidden />
            <span>{mode.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="flex w-full items-center justify-between rounded-2xl border-border/60 bg-background/90 px-4 py-2 text-sm"
            aria-label="Configure custom task mix"
          >
            <span>Configure custom mix</span>
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 space-y-4 rounded-2xl border border-border bg-card p-4 text-sm shadow-lg"
          align="end"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">Select task types</p>
            <p className="text-xs text-muted-foreground">
              At least one task type must remain selected.
            </p>
          </div>
          <div className="space-y-3">
            {sortedTaskTypes.map((taskType) => {
              const copy = getTaskTypeCopy(taskType);
              const checked = selectedSet.has(taskType);
              return (
                <label
                  key={taskType}
                  htmlFor={`${resolvedDebugId}-${taskType}`}
                  className="flex items-start gap-3 rounded-xl border border-transparent p-2 transition hover:border-border/60"
                >
                  <Checkbox
                    id={`${resolvedDebugId}-${taskType}`}
                    checked={checked}
                    onCheckedChange={(value) => handleTaskTypeToggle(taskType, Boolean(value))}
                  />
                  <div>
                    <p className="font-medium text-foreground">{copy.label}</p>
                    <p className="text-xs text-muted-foreground">{copy.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
