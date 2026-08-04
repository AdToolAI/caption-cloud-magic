import { forwardRef } from "react";
import {
  CANVAS_SIZE,
  FONT_STACKS,
  type BadgeLayer,
  type ImageLayer,
  type Layer,
  type LogoLayer,
  type PostDesign,
  type PostSlide,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/post-design/schema";
import { fitTextSize } from "@/lib/post-design/autofit";

interface SlideRendererProps {
  slide: PostSlide;
  design: PostDesign;
  /** Darstellungsgröße in px; intern wird immer 1080 gerendert und skaliert. */
  size: number;
  className?: string;
  /** Zeigt in leeren Bildebenen einen ruhigen Ladezustand, solange das KI-Motiv rendert. */
  pendingImage?: boolean;
}


function scrimGradient(layer: ImageLayer): string | undefined {
  const a = layer.scrim ?? 0;
  if (a <= 0) return undefined;
  switch (layer.scrimDirection ?? "bottom") {
    case "top":
      return `linear-gradient(to bottom, rgba(0,0,0,${a}) 0%, rgba(0,0,0,0) 60%)`;
    case "full":
      return `linear-gradient(to bottom, rgba(0,0,0,${a * 0.9}) 0%, rgba(0,0,0,${a}) 100%)`;
    case "left":
      return `linear-gradient(to right, rgba(0,0,0,${a}) 0%, rgba(0,0,0,0) 70%)`;
    default:
      return `linear-gradient(to top, rgba(0,0,0,${a}) 0%, rgba(0,0,0,0) 65%)`;
  }
}

function LayerView({ layer, design, pending }: { layer: Layer; design: PostDesign; pending?: boolean }) {
  const box: React.CSSProperties = {
    position: "absolute",
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${layer.w * 100}%`,
    height: `${layer.h * 100}%`,
    opacity: layer.opacity ?? 1,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
  };

  if (layer.type === "image") {
    const l = layer as ImageLayer;
    const zoom = l.zoom ?? 1;
    return (
      <div style={{ ...box, overflow: "hidden", borderRadius: l.radius ?? 0 }}>
        {l.src ? (
          <img
            src={l.src}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${zoom}) translate(${(l.offsetX ?? 0) * 100}%, ${(l.offsetY ?? 0) * 100}%)`,
            }}
          />
        ) : pending ? (
          <div
            className="animate-pulse"
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${design.palette.surface}, ${design.palette.background} 60%, ${design.palette.surface})`,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `repeating-linear-gradient(45deg, ${design.palette.surface}, ${design.palette.surface} 24px, ${design.palette.background} 24px, ${design.palette.background} 48px)`,
            }}
          />
        )}

        {scrimGradient(l) && (
          <div style={{ position: "absolute", inset: 0, background: scrimGradient(l) }} />
        )}
      </div>
    );
  }

  if (layer.type === "shape") {
    const l = layer as ShapeLayer;
    const radius =
      l.shape === "circle" ? "50%" : l.shape === "pill" ? 9999 : l.shape === "line" ? 999 : l.radius ?? 0;
    const background =
      l.shape === "gradient" ? `linear-gradient(135deg, ${l.color}, ${l.color2 ?? l.color})` : l.color;
    return <div style={{ ...box, background, borderRadius: radius }} />;
  }

  if (layer.type === "text") {
    const l = layer as TextLayer;
    const fontFamily = FONT_STACKS[l.font](design.fonts);
    const fontSize = fitTextSize(l, fontFamily);
    return (
      <div
        style={{
          ...box,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start",
          textAlign: l.align,
          color: l.color,
          fontFamily,
          fontSize,
          fontWeight: l.weight,
          lineHeight: l.lineHeight ?? 1.15,
          letterSpacing: `${(l.letterSpacing ?? 0) * fontSize}px`,
          textTransform: l.uppercase ? "uppercase" : "none",
          textShadow: l.shadow ? "0 2px 24px rgba(0,0,0,0.45)" : "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {l.highlight ? (
          <span style={{ background: l.highlight, padding: "0.05em 0.2em", borderRadius: 8 }}>{l.text}</span>
        ) : (
          l.text
        )}
      </div>
    );
  }

  if (layer.type === "badge") {
    const l = layer as BadgeLayer;
    return (
      <div
        style={{
          ...box,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: l.bg,
          color: l.color,
          borderRadius: l.radius ?? 9999,
          fontFamily: FONT_STACKS.body(design.fonts),
          fontSize: l.size * CANVAS_SIZE,
          fontWeight: 700,
          letterSpacing: `${0.06 * l.size * CANVAS_SIZE}px`,
          textTransform: l.uppercase ? "uppercase" : "none",
          padding: "0 1em",
          whiteSpace: "nowrap",
        }}
      >
        {l.text}
      </div>
    );
  }

  const l = layer as LogoLayer;
  return (
    <div style={{ ...box, display: "flex", alignItems: "center" }}>
      {l.src ? (
        <img
          src={l.src}
          alt=""
          crossOrigin="anonymous"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      ) : (
        <span
          style={{
            fontFamily: FONT_STACKS.mono(design.fonts),
            fontSize: 0.024 * CANVAS_SIZE,
            letterSpacing: 6,
            fontWeight: 700,
            color: l.color ?? design.palette.text,
          }}
        >
          {l.fallbackText ?? "MARKE"}
        </span>
      )}
    </div>
  );
}

/**
 * Rendert einen Slide immer im 1080x1080-Raum und skaliert per CSS-Transform.
 * Derselbe Pfad bedient Vorschau, Varianten-Galerie und Export (WYSIWYG).
 */
export const SlideRenderer = forwardRef<HTMLDivElement, SlideRendererProps>(
  ({ slide, design, size, className, pendingImage }, ref) => {
    const scale = size / CANVAS_SIZE;
    return (
      <div style={{ width: size, height: size, overflow: "hidden" }} className={className}>
        <div
          ref={ref}
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            position: "relative",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: slide.backgroundGradient
              ? `linear-gradient(135deg, ${slide.backgroundGradient[0]}, ${slide.backgroundGradient[1]})`
              : slide.background || design.palette.background,
            overflow: "hidden",
          }}
        >
          {slide.layers.map((layer) => (
            <LayerView key={layer.id} layer={layer} design={design} />
          ))}
        </div>
      </div>
    );
  },
);

SlideRenderer.displayName = "SlideRenderer";
