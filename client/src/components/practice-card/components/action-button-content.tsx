import { CornerDownLeft, Space as SpaceIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function formatShortcutKey(key: string): ReactNode {
  const renderArrow = (symbol: string, description: string) => (
    <>
      <span aria-hidden className="text-xl leading-none">
        {symbol}
      </span>
      <span className="sr-only">{description}</span>
    </>
  );

  if (key === 'Enter') {
    return (
      <>
        <CornerDownLeft className="h-6 w-6" aria-hidden />
        <span className="sr-only">Enter</span>
      </>
    );
  }

  if (key === 'ArrowRight') {
    return renderArrow('→', 'Arrow Right');
  }

  if (key === 'ArrowLeft') {
    return renderArrow('←', 'Arrow Left');
  }

  if (key === 'ArrowUp') {
    return renderArrow('↑', 'Arrow Up');
  }

  if (key === 'ArrowDown') {
    return renderArrow('↓', 'Arrow Down');
  }

  if (key === 'Escape') {
    return 'Esc';
  }

  if (key === 'Space' || key === ' ') {
    return (
      <>
        <SpaceIcon className="h-6 w-6" aria-hidden />
        <span className="sr-only">Space</span>
      </>
    );
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

export function ActionButtonContent({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex w-full items-center justify-center gap-3 text-base font-semibold leading-tight text-inherit">
      <span className="flex items-center gap-2">
        {label}
      </span>
      {hint ? (
        <span className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-primary-foreground/70">
          {hint}
        </span>
      ) : null}
    </span>
  );
}
