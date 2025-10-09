import { useMemo } from 'react';
import { BookOpen, Flame, PenLine, SlidersHorizontal, Sparkles } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getTaskTypeCopy } from '@/lib/task-metadata';
import type { TaskType } from '@shared';
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';
import type { PracticeScope } from '@/lib/practice-overview';

export type { PracticeScope } from '@/lib/practice-overview';

interface PracticeModeSwitcherProps extends DebuggableComponentProps {
  scope: PracticeScope;
  onScopeChange: (scope: PracticeScope) => void;
  selectedTaskTypes: TaskType[];
  onTaskTypesChange: (taskTypes: TaskType[]) => void;
  availableTaskTypes: ReadonlyArray<TaskType>;
  scopeBadgeLabel: string;
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
  scopeBadgeLabel,
  debugId,
}: PracticeModeSwitcherProps) {
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
    <Popover debugId={`${resolvedDebugId}-popover`}>
      <PopoverTrigger asChild debugId={`${resolvedDebugId}-trigger`}>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-sm font-medium text-primary transition hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Adjust practice scope"
          {...getDevAttributes('practice-mode-switcher-trigger', `${resolvedDebugId}-trigger`)}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {scopeBadgeLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-[360px] space-y-5 rounded-3xl border border-border/60 bg-card p-5 shadow-xl"
        debugId={`${resolvedDebugId}-content`}
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Practice scope</p>
          <p className="text-xs text-muted-foreground">Pick a preset or fine-tune the mix.</p>
        </div>

        <Tabs
          value={activeMode.value}
          onValueChange={(value) => handleScopeChange(value as PracticeScope | '')}
          className="w-full"
          {...getDevAttributes('practice-mode-switcher', resolvedDebugId)}
        >
          <TabsList className="flex h-auto w-full flex-wrap gap-2 bg-transparent p-0">
            {MODE_CONFIG.filter((mode) => mode.value !== 'custom').map((mode) => (
              <TabsTrigger
                key={mode.value}
                value={mode.value}
                className={cn(
                  'flex min-w-[110px] items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground transition',
                  'hover:text-foreground data-[state=active]:border-transparent data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:ring-2 data-[state=active]:ring-primary/50 data-[state=active]:ring-offset-2 data-[state=active]:ring-offset-background',
                )}
              >
                <mode.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{mode.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {sortedTaskTypes.map((taskType) => {
              const copy = getTaskTypeCopy(taskType);
              const checked = selectedSet.has(taskType);
              const checkboxId = `${resolvedDebugId}-${taskType}`;
              return (
                <div
                  key={taskType}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2 transition',
                    checked ? 'bg-muted/60 border-border/80' : 'hover:bg-muted/40',
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    onCheckedChange={(value) => handleTaskTypeToggle(taskType, Boolean(value))}
                    aria-label={copy.label}
                    className="mt-0.5 shrink-0"
                  />
                  <Label
                    htmlFor={checkboxId}
                    className="space-y-1 text-sm text-foreground"
                    debugId={`${resolvedDebugId}-${taskType}-label`}
                  >
                    <span className="block font-medium leading-none">{copy.label}</span>
                    <span className="block text-xs text-muted-foreground">{copy.description}</span>
                  </Label>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
