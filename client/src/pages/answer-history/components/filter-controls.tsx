import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { LevelFilter, ResultFilter } from "../utils";

interface FilterControlsProps {
  sectionId?: string;
  levelOptions: LevelFilter[];
  resultOptions: ResultFilter[];
  selectedLevel: LevelFilter;
  selectedResult: ResultFilter;
  onLevelChange: (level: LevelFilter) => void;
  onResultChange: (result: ResultFilter) => void;
  onResetFilters: () => void;
  activeFilters: string[];
  hasActiveFilters: boolean;
}

export function FilterControls({
  sectionId,
  levelOptions,
  resultOptions,
  selectedLevel,
  selectedResult,
  onLevelChange,
  onResultChange,
  onResetFilters,
  activeFilters,
  hasActiveFilters,
}: FilterControlsProps) {
  return (
    <section
      className="grid gap-6 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5"
      id={sectionId}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by level</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {levelOptions.map((option) => (
            <Button
              key={option}
              variant={option === selectedLevel ? "default" : "secondary"}
              className="rounded-2xl px-4"
              type="button"
              onClick={() => onLevelChange(option)}
            >
              {option === "all" ? "All" : option}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by result</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {resultOptions.map((option) => (
            <Button
              key={option}
              variant={option === selectedResult ? "default" : "secondary"}
              className="rounded-2xl px-4 capitalize"
              type="button"
              onClick={() => onResultChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/15 p-4">
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="rounded-full border-border/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                {label}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.22em]"
            onClick={onResetFilters}
          >
            Reset filters
          </Button>
        </div>
      ) : null}
    </section>
  );
}
