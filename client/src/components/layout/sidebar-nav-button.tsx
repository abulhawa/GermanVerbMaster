import { type ComponentType } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";

interface SidebarNavButtonProps {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}

export function SidebarNavButton({ href, label, icon: Icon, exact = false }: SidebarNavButtonProps) {
  const [location] = useLocation();
  const isActive = exact ? location === href : location.startsWith(href);

  return (
    <Link href={href}>
      <Button
        variant={isActive ? "default" : "secondary"}
        className="w-full justify-start rounded-2xl px-4 py-6 text-sm"
      >
        <Icon className="mr-3 h-5 w-5" aria-hidden />
        {label}
      </Button>
    </Link>
  );
}
