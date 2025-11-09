import { Badge } from '@/components/ui/badge';
import type { QueueDiagnosticsSnapshot } from '../use-practice-session';

export interface QueueDiagnosticsMessages {
  title: string;
  description: string;
  status: {
    blocked: string;
    fetching: string;
    replenishing: string;
    healthy: string;
  };
  labels: {
    queued: string;
    threshold: string;
    server: string;
    signature: string;
  };
  serverStates: {
    yes: string;
    no: string;
  };
}

export interface QueueDiagnosticsCardProps {
  diagnostics: QueueDiagnosticsSnapshot;
  isFetching: boolean;
  hasBlockingError: boolean;
  fetchError: string | null;
  messages: QueueDiagnosticsMessages;
}

function resolveStatus({
  diagnostics,
  isFetching,
  hasBlockingError,
  messages,
}: Pick<QueueDiagnosticsCardProps, 'diagnostics' | 'isFetching' | 'hasBlockingError' | 'messages'>) {
  if (hasBlockingError) {
    return { label: messages.status.blocked, variant: 'destructive' as const };
  }

  if (isFetching) {
    return { label: messages.status.fetching, variant: 'secondary' as const };
  }

  if (diagnostics.queueLength <= diagnostics.threshold / 2) {
    return { label: messages.status.replenishing, variant: 'secondary' as const };
  }

  return { label: messages.status.healthy, variant: 'default' as const };
}

export function QueueDiagnosticsCard({ diagnostics, isFetching, hasBlockingError, fetchError, messages }: QueueDiagnosticsCardProps) {
  const status = resolveStatus({ diagnostics, isFetching, hasBlockingError, messages });

  return (
    <div className="rounded-3xl border border-border/60 bg-card/80 px-4 py-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{messages.title}</p>
          <p className="text-xs text-muted-foreground">{messages.description}</p>
        </div>
        <Badge variant={status.variant} className="uppercase tracking-[0.18em]" debugId="queue-diagnostics-status">
          {status.label}
        </Badge>
      </div>
      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{messages.labels.queued}</dt>
          <dd className="font-medium">{diagnostics.queueLength}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{messages.labels.threshold}</dt>
          <dd className="font-medium">{diagnostics.threshold}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{messages.labels.server}</dt>
          <dd className="font-medium">
            {diagnostics.isServerExhausted ? messages.serverStates.yes : messages.serverStates.no}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{messages.labels.signature}</dt>
          <dd className="font-mono text-[11px]">
            {diagnostics.lastFailedSignature ? diagnostics.lastFailedSignature : '—'}
          </dd>
        </div>
      </dl>
      {fetchError ? (
        <p className="mt-3 text-xs text-destructive" data-testid="queue-diagnostics-error">
          {fetchError}
        </p>
      ) : null}
    </div>
  );
}
