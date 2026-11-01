import { ImageOff } from "lucide-react";

import { cn } from "@/lib/cn";
import type { ExaminationImage, NormalizedRect } from "@/types/examination";

const FULL: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

/** Shows part of an original without altering it. Never distorts: the region is fitted inside the box. */
export function CroppedImage({
  image,
  url,
  region,
  alt,
  className,
}: {
  image: Pick<ExaminationImage, "width" | "height" | "crop">;
  url: string | undefined;
  /** Defaults to the image's crop. */
  region?: NormalizedRect | null;
  alt: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-sunken text-ink-4", className)} role="img" aria-label={`${alt}, image unavailable`}>
        <ImageOff className="size-4" aria-hidden />
      </div>
    );
  }
  const rect = region ?? image.crop ?? FULL;
  return (
    <svg
      role="img"
      aria-label={alt}
      className={cn("block bg-white", className)}
      viewBox={`${rect.x * image.width} ${rect.y * image.height} ${rect.width * image.width} ${rect.height * image.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={url} width={image.width} height={image.height} />
    </svg>
  );
}
