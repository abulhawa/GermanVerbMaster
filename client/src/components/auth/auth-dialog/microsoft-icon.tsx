import type { SVGProps } from "react";

export function MicrosoftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
      className="h-4 w-4 text-primary"
      {...props}
    >
      <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity={0.9} />
      <rect x="13" y="3" width="8" height="8" fill="currentColor" opacity={0.7} />
      <rect x="3" y="13" width="8" height="8" fill="currentColor" opacity={0.7} />
      <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity={0.9} />
    </svg>
  );
}
