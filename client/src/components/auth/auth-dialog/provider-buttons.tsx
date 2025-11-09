import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface AuthProviderButtonConfig {
  id: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
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
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          className="w-full rounded-2xl"
          onClick={provider.onClick}
          disabled={provider.disabled}
        >
          {provider.icon ? <span className="mr-2 inline-flex items-center">{provider.icon}</span> : null}
          {provider.label}
        </Button>
      ))}
    </div>
  );
}
