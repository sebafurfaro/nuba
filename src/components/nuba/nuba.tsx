import { cn } from "@heroui/react";

type NubaProps = {
  className?: string;
};

export function Nuba({ className }: NubaProps) {
  return (
    <svg
      className={cn("shrink-0 text-foreground", className)}
      width="100"
      height="32"
      viewBox="0 0 110 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nuba"
      role="img"
    >
      <text
        x="0"
        y="28"
        fontFamily="Georgia, serif"
        fontSize="32"
        fontWeight="400"
        fill="currentColor"
        letterSpacing="-1"
      >
        nuba
      </text>
    </svg>
  );
}
