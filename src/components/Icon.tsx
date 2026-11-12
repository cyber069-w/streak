/** Line icons (24×24, stroke = currentColor): Tabler Icons, bundled in icons.generated.ts (see scripts/build-icons.mjs). */
import { ICON_PATHS as PATHS } from './icons.generated';

export type IconName = string;

export function Icon({ name, size = 20, stroke = 1.75, className }: { name: IconName; size?: number | string; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
