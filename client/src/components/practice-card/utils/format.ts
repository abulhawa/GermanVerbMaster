import type { PracticeTask } from '@/lib/tasks';
import { formatUnsupportedRendererMessage } from '@/locales';
import type { PracticeCardMessages } from '@/locales';

export function formatPartOfSpeechLabel(task: PracticeTask): string {
  const base = task.pos ?? task.taskType;
  return base.replace(/[_-]+/g, ' ').toUpperCase();
}

export function formatInstructionTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((result, [token, value]) => {
    return result.replaceAll(`{${token}}`, value);
  }, template);
}

export function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export function formatEnglishTranslation(value: string): string {
  const trimmed = value.trim();
  if (!/[,;]/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(' – ') || trimmed;
}

export function formatUnsupportedDescription(
  copy: PracticeCardMessages,
  taskType: PracticeTask['taskType'],
): string {
  return formatUnsupportedRendererMessage(copy.unsupported.description, taskType);
}
