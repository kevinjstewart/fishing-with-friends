import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "anchor"
  | "bait"
  | "book"
  | "check"
  | "coin"
  | "fish"
  | "friend"
  | "lock"
  | "lure"
  | "map"
  | "rod"
  | "shop"
  | "spark"
  | "trophy"
  | "waves"
  | "weight";

const ICON_PATHS: Record<IconName, string[]> = {
  waves: [
    "M3 9.5c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0",
    "M3 15c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0",
  ],
  shop: [
    "M6.5 8.5h11l-.9 11a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8l-.9-11Z",
    "M9 10.5V7a3 3 0 0 1 6 0v3.5",
  ],
  trophy: [
    "M8 21h8",
    "M12 17v4",
    "M7 4h10v5a5 5 0 0 1-10 0V4Z",
    "M7 6H4.5A2.5 2.5 0 0 0 7 10",
    "M17 6h2.5A2.5 2.5 0 0 1 17 10",
  ],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"],
  coin: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  friend: [
    "M10 11a3.25 3.25 0 1 0-3.2-4",
    "M3.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5",
    "M16.5 7.5A3 3 0 1 0 16 1.6",
    "M18.5 12.8c1.85.95 3 2.75 3 4.95",
  ],
  anchor: ["M12 7.5A2.25 2.25 0 1 0 12 3a2.25 2.25 0 0 0 0 4.5Z", "M12 7.5V21", "M4.5 13.5a7.5 7.5 0 0 0 15 0", "M8.5 10.5h7"],
  rod: [
    "M4 20C10.5 18.5 17.5 12 20 4",
    "M20 4c.8 3.2-.3 6.4-3 8.6",
    "M10.3 16.5a1.8 1.8 0 1 0-3.6 0 1.8 1.8 0 0 0 3.6 0Z",
  ],
  lure: [
    "M12 3v2",
    "M12 5c3 3.8 5 6 5 9a5 5 0 1 1-10 0c0-3 2-5.2 5-9Z",
    "M13.2 16.2a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 0 0 2.4 0Z",
  ],
  bait: ["M4 14.5c2-5 5-5 7 0s5 5 7 0"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  lock: ["M8 10.5V7.8a4 4 0 0 1 8 0v2.7", "M6.2 10.5h11.6a1.2 1.2 0 0 1 1.2 1.2v7.1a1.2 1.2 0 0 1-1.2 1.2H6.2a1.2 1.2 0 0 1-1.2-1.2v-7.1a1.2 1.2 0 0 1 1.2-1.2Z"],
  alert: ["M12 3.5 2.8 19.5h18.4L12 3.5Z", "M12 9.5v4.2", "M12 16.6v.01"],
  fish: ["M4 12c3.5-4.2 8.4-5.6 13.2-2.2L21 7.5v9l-3.8-2.3C12.4 17.6 7.5 16.2 4 12Z", "M8.2 11.8h.01"],
  map: ["M3.5 6.2 9 3l6 3 5.5-3.2v15L15 21l-6-3-5.5 3.2v-15Z", "M9 3v15", "M15 6v15"],
  spark: ["M12 2.8 13.8 9l6.2 1.8-6.2 1.8L12 19l-1.8-6.4L4 10.8 10.2 9 12 2.8Z"],
  weight: ["M8 8.5a4 4 0 1 1 8 0", "M6.2 8.5h11.6l2 12H4.2l2-12Z", "M12 8.5l2-2"],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
}

export function Icon({ name, className = "icon", ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      {ICON_PATHS[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}
