import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface AuthProviderButtonConfig {
  id: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

interface AuthDialogProviderButtonsProps {
  providers?: AuthProviderButtonConfig[];
}

export function AuthDialogProviderButtons({ providers = [] }: AuthDialogProviderButtonsProps) {
  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <div key={provider.id} className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl"
            onClick={provider.onClick}
            disabled={provider.disabled}
            aria-disabled={provider.disabled}
            aria-describedby={provider.disabledReason ? `${provider.id}-provider-note` : undefined}
            title={provider.disabledReason}
          >
            {provider.icon ? <span className="mr-2 inline-flex items-center">{provider.icon}</span> : null}
            {provider.label}
          </Button>
          {provider.disabled && provider.disabledReason ? (
            <p
              id={`${provider.id}-provider-note`}
              className="text-xs text-muted-foreground"
            >
              {provider.disabledReason}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
