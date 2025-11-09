import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDevAttributes } from '@/lib/dev-attributes';
import { useTranslations } from '@/locales';

import type { RendererProps } from '../types';
import { formatUnsupportedDescription } from '../utils/format';

export function UnsupportedRenderer({ task, debugId }: RendererProps) {
  const { practiceCard: copy } = useTranslations();
  const description = formatUnsupportedDescription(copy, task.taskType);
  return (
    <Card
      {...getDevAttributes('practice-card-unsupported', debugId ?? 'practice-card-unsupported')}
      className="rounded-3xl border border-border/70 bg-card/90 p-6 text-center shadow-lg shadow-primary/5"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">{copy.unsupported.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>{description}</p>
        <p>{copy.unsupported.retry}</p>
      </CardContent>
    </Card>
  );
}
