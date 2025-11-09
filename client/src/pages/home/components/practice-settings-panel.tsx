import { PracticeModeSwitcher, type PracticeScope } from '@/components/practice-mode-switcher';
import { UserMenuControl } from '@/components/auth/user-menu-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CEFRLevel, TaskType } from '@shared';

const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface VerbLevelSelectProps {
  value: CEFRLevel;
  onChange: (level: CEFRLevel) => void;
  labelId: string;
}

function VerbLevelSelect({ value, onChange, labelId }: VerbLevelSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CEFRLevel)} debugId="home-verb-level-select">
      <SelectTrigger
        aria-labelledby={labelId}
        className="h-12 w-28 rounded-full border border-border/60 bg-background/90 px-5 text-sm font-medium text-foreground shadow-soft"
        debugId="home-verb-level-trigger"
      >
        <SelectValue debugId="home-verb-level-value" />
      </SelectTrigger>
      <SelectContent debugId="home-verb-level-menu" align="start">
        {CEFR_LEVELS.map((level) => (
          <SelectItem key={level} value={level} debugId={`home-verb-level-${level.toLowerCase()}`}>
            {level}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface PracticeSettingsPanelProps {
  scope: PracticeScope;
  scopeBadgeLabel: string;
  activeTaskTypes: TaskType[];
  availableTaskTypes: TaskType[];
  verbLevel: CEFRLevel;
  verbLevelLabelId: string;
  modeSwitcherId: string;
  levelLabel: string;
  onScopeChange: (scope: PracticeScope) => void;
  onTaskTypesChange: (taskTypes: TaskType[]) => void;
  onVerbLevelChange: (level: CEFRLevel) => void;
}

export function PracticeSettingsPanel({
  scope,
  scopeBadgeLabel,
  activeTaskTypes,
  availableTaskTypes,
  verbLevel,
  verbLevelLabelId,
  levelLabel,
  modeSwitcherId,
  onScopeChange,
  onTaskTypesChange,
  onVerbLevelChange,
}: PracticeSettingsPanelProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card/80 px-4 py-2 shadow-soft">
      <div className="flex flex-wrap items-center gap-3" id={modeSwitcherId}>
        <span id={verbLevelLabelId} className="sr-only">
          {levelLabel}
        </span>
        <PracticeModeSwitcher
          debugId="topbar-mode-switcher"
          scope={scope}
          onScopeChange={onScopeChange}
          selectedTaskTypes={activeTaskTypes}
          onTaskTypesChange={onTaskTypesChange}
          availableTaskTypes={availableTaskTypes}
          scopeBadgeLabel={scopeBadgeLabel}
        />
        <VerbLevelSelect value={verbLevel} onChange={onVerbLevelChange} labelId={verbLevelLabelId} />
      </div>
      <UserMenuControl className="w-auto flex-none" />
    </div>
  );
}
