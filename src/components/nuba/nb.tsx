import { cn } from "@heroui/react";

type NbProps = {
  className?: string;
};

/** Marca compacta; usa `dark:` para el modo oscuro (claro = base). */
export function Nb({ className }: NbProps) {
  return (
    <svg
      className={cn("h-14 w-14 shrink-0", className)}
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        width="56"
        height="56"
        rx="14"
        className="fill-zinc-900 dark:fill-zinc-100"
      />
      <text
        x="8"
        y="38"
        fontFamily="Georgia, serif"
        fontSize="26"
        fontWeight="400"
        letterSpacing="-1"
        className="fill-zinc-100 dark:fill-zinc-900"
      >
        nb
      </text>
    </svg>
  );
}
