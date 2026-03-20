import Image from "next/image"
import { cn } from "@/lib/utils"

/** Canonical product name across dashboard, TV, and embedded Langflow. */
export const AICCORE_MAKERSPACE = "AICCORE Makerspace"

type AiccoreLogoProps = {
  className?: string
  /** Square edge length in CSS pixels */
  size?: number
  /** Lighten logo for dark backgrounds (placeholder SVG is dark); turn off when using a full-color asset */
  forDarkBackground?: boolean
}

export function AiccoreLogo({
  className,
  size = 28,
  forDarkBackground = false,
}: AiccoreLogoProps) {
  return (
    <Image
      src="/aiccore-logo.svg"
      alt={AICCORE_MAKERSPACE}
      width={size}
      height={size}
      className={cn(
        "shrink-0 object-contain rounded-lg",
        forDarkBackground && "brightness-0 invert opacity-95",
        className
      )}
      priority
    />
  )
}
