import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { ExaminationImage } from "@/types/examination";

import { CroppedImage } from "./cropped-image";

/** Row of every signature in the examination, shared by the crop and mark steps. */
export function SignatureStrip({
  images,
  imageUrls,
  activeId,
  onSelect,
  badge,
}: {
  images: ExaminationImage[];
  imageUrls: Record<string, string>;
  activeId: string;
  onSelect: (imageId: string) => void;
  badge?: (image: ExaminationImage) => ReactNode;
}) {
  return (
    <ul className="mb-4 flex gap-2 overflow-x-auto p-0.5">
      {images.map((image) => {
        const isActive = image.id === activeId;
        return (
          <li key={image.id} className="w-24 shrink-0">
            <button
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSelect(image.id)}
              className={cn(
                "pressable block w-full overflow-hidden rounded-sm border text-left",
                isActive ? "border-brand ring-1 ring-brand" : "border-line-strong hover:border-ink-4",
              )}
            >
              <CroppedImage image={image} url={imageUrls[image.id]} alt={`${image.label} preview`} className="aspect-4/3 w-full" />
              <span className="flex items-center justify-between border-t border-line px-1.5 py-1 text-[12.5px] font-semibold text-ink tabular">
                {image.label}
                {badge?.(image)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
