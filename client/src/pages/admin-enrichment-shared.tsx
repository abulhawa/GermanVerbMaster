import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { AdminWord } from './admin-word-schemas';

export interface BooleanToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description?: string;
}

export function BooleanToggle({ label, checked, onCheckedChange, description }: BooleanToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <Label>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export interface CollapsibleSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerId: string;
  children: ReactNode;
  headerActions?: ReactNode;
}

export function CollapsibleSection({
  icon: Icon,
  title,
  description,
  open,
  onOpenChange,
  triggerId,
  children,
  headerActions,
}: CollapsibleSectionProps) {
  const contentId = `${triggerId}-content`;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" /> {title}
              </CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {headerActions}
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
                  aria-controls={contentId}
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent id={contentId}>
          <CardContent className="space-y-6">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export interface DetailFieldProps {
  label: string;
  value: ReactNode;
}

export function DetailField({ label, value }: DetailFieldProps) {
  const displayValue =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0)
      ? '—'
      : value;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm text-foreground">{displayValue}</div>
    </div>
  );
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  english: 'English translation',
  exampleDe: 'German example',
  exampleEn: 'English example',
  praeteritum: 'Präteritum',
  partizipIi: 'Partizip II',
  perfekt: 'Perfekt',
  gender: 'Gender',
  plural: 'Plural',
  comparative: 'Comparative',
  superlative: 'Superlative',
};

export function formatMissingField(field: string): string {
  return MISSING_FIELD_LABELS[field] ?? field;
}

export function getMissingFields(word: AdminWord): string[] {
  const missing = new Set<string>();

  const check = (value: unknown, key: string) => {
    if (value === null || value === undefined) {
      missing.add(key);
      return;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      missing.add(key);
    }
  };

  check(word.english, 'english');
  check(word.exampleDe, 'exampleDe');
  check(word.exampleEn, 'exampleEn');

  switch (word.pos) {
    case 'V':
      check(word.praeteritum, 'praeteritum');
      check(word.partizipIi, 'partizipIi');
      check(word.perfekt, 'perfekt');
      break;
    case 'N':
      check(word.gender, 'gender');
      check(word.plural, 'plural');
      break;
    case 'Adj':
      check(word.comparative, 'comparative');
      check(word.superlative, 'superlative');
      break;
    default:
      break;
  }

  return Array.from(missing);
}
