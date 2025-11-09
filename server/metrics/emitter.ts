import { logStructured } from "../logger.js";

export interface MetricEvent {
  name: string;
  value?: number;
  tags?: Record<string, string>;
}

export type MetricHandler = (event: MetricEvent) => void;

const handlers: Set<MetricHandler> = new Set();

export function emitMetric(event: MetricEvent): void {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (error) {
      logStructured({
        source: "metrics",
        level: "error",
        event: "metrics.handler_failure",
        message: "Metric handler threw an error",
        data: {
          name: event.name,
        },
        error,
      });
    }
  }
}

export function registerMetricHandler(handler: MetricHandler): () => void {
  handlers.add(handler);

  return () => {
    handlers.delete(handler);
  };
}
