"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Case evidence image (signature scan, Grad-CAM overlay) served by the proxy.
 * Always object-contain so the evidence is never cropped, on a checkerboard so
 * transparent strokes stay visible.
 */
export function EvidenceImage({
  src,
  alt,
  className,
  fit = "contain",
  title,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fit?: "contain" | "cover";
  title?: string;
}) {
  const [state, setState] = useState<{ src: string | null; status: "loading" | "loaded" | "error" }>({
    src,
    status: "loading",
  });
  // Reset when the source changes (e.g. switching Heatmap → Stroke Diff).
  const status = state.src === src ? state.status : "loading";

  return (
    <div className={cn("evidence-bg relative overflow-hidden", className)} title={title}>
      {src && status !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy image, not optimizable
        <img
          key={src}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setState({ src, status: "loaded" })}
          onError={() => setState({ src, status: "error" })}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-200",
            fit === "contain" ? "object-contain" : "object-cover",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
      {src && status === "loading" ? <div className="skeleton absolute inset-0 rounded-none" aria-hidden /> : null}
      {!src || status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-sunken text-ink-4">
          <ImageOff className="size-5" aria-hidden />
          <span className="text-[12px] font-medium">{src ? "Image unavailable" : "Not available"}</span>
        </div>
      ) : null}
    </div>
  );
}
