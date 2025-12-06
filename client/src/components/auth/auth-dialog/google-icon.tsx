import type { SVGProps } from "react";

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
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
      <path
        d="M21.6 12.227c0-.639-.057-1.252-.163-1.84H12v3.48h5.367a4.588 4.588 0 0 1-1.99 3.009v2.504h3.223c1.885-1.737 2.98-4.293 2.98-7.153Z"
        fill="currentColor"
        opacity={0.9}
      />
      <path
        d="M12 22c2.7 0 4.967-.891 6.622-2.42l-3.223-2.504c-.896.6-2.044.955-3.399.955-2.614 0-4.829-1.767-5.618-4.143H3.04v2.604A9.999 9.999 0 0 0 12 22Z"
        fill="currentColor"
        opacity={0.7}
      />
      <path
        d="M6.382 13.888A6.004 6.004 0 0 1 6.07 12c0-.654.112-1.288.312-1.888V7.508H3.04A9.999 9.999 0 0 0 2 12c0 1.602.384 3.118 1.04 4.492l3.342-2.604Z"
        fill="currentColor"
        opacity={0.6}
      />
      <path
        d="M12 5.818c1.467 0 2.784.505 3.817 1.498l2.863-2.863C16.965 2.99 14.7 2 12 2a9.999 9.999 0 0 0-8.96 5.508l3.342 2.604C6.771 7.585 8.986 5.818 12 5.818Z"
        fill="currentColor"
        opacity={0.5}
      />
    </svg>
  );
}
