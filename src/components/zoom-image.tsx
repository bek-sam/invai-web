import { Button, cn } from "@invai/ui";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type * as React from "react";
import { useCallback, useRef, useState } from "react";

/**
 * Pan (drag) and zoom (wheel or buttons) for tall gang-sheet previews. `overlay` renders in
 * image coordinates as percentages, so placement boxes stay aligned at every zoom level.
 */
export function ZoomImage({
  src,
  alt,
  className,
  overlay,
}: {
  src: string;
  alt: string;
  className?: string;
  overlay?: React.ReactNode;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const zoom = useCallback((factor: number) => {
    setScale((s) => Math.min(8, Math.max(0.5, s * factor)));
  }, []);
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border checkerboard",
        className,
      )}
    >
      <div
        className="size-full cursor-grab touch-none select-none active:cursor-grabbing"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 40) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          className="relative mx-auto w-fit origin-top"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="block max-h-[70vh] w-auto max-w-full"
          />
          {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
        </div>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 rounded-md bg-background/90 p-1 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => zoom(1.25)}
          aria-label="Zoom in"
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => zoom(0.8)}
          aria-label="Zoom out"
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={reset}
          aria-label="Reset zoom"
        >
          <Maximize2 />
        </Button>
      </div>
    </div>
  );
}
