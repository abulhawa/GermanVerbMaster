import { useMemo } from 'react';
import { BookOpen, Flame, Info, PenLine, SlidersHorizontal, Sparkles, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
    <TooltipProvider delayDuration={0}>
      <Tabs
        value={scope}
        onValueChange={(value) => handleScopeChange(value as PracticeScope | '')}
        className="w-full space-y-3"
        {...getDevAttributes('practice-mode-switcher', resolvedDebugId)}
      >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>Practice scope</span>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition hover:text-foreground"
                aria-label={activeMode.description}
              >
                <Info className="h-3 w-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
              {activeMode.description}
            </TooltipContent>
          </Tooltip>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
        >
          {selectedTaskTypes.length} selected
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/85 px-2 py-2 shadow-sm">
        <TabsList className="flex flex-1 flex-wrap gap-2 bg-transparent p-0">
          {MODE_CONFIG.map((mode) => (
            <TabsTrigger
              key={mode.value}
              value={mode.value}
              className={cn(
                'flex min-w-[110px] items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
              )}
            >
              <mode.icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{mode.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              aria-label="Configure custom task mix"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Custom mix
              <ChevronDown className="h-3 w-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 space-y-1 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-xl" align="end">
            <DropdownMenuLabel className="text-sm font-medium text-muted-foreground">
              Task types
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sortedTaskTypes.map((taskType) => {
              const copy = getTaskTypeCopy(taskType);
              const checked = selectedSet.has(taskType);
              return (
                <DropdownMenuCheckboxItem
                  key={taskType}
                  checked={checked}
                  onCheckedChange={(value) => handleTaskTypeToggle(taskType, Boolean(value))}
                  aria-label={copy.label}
                  className="flex items-start gap-3 rounded-xl px-2 py-1.5 text-sm text-foreground focus:bg-muted"
                >
                  <div className="space-y-1">
                    <p className="font-medium leading-none">{copy.label}</p>
                    <p className="text-xs text-muted-foreground">{copy.description}</p>
                  </div>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Tabs>
    </TooltipProvider>
  );
}
