import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CANVAS_SIZE } from "./schema";

/**
 * Rendert ein DOM-Element (immer 1080x1080 Renderziel) zu PNG.
 * Der Renderer wird für den Export auf 1:1 skaliert, damit Textkanten scharf bleiben.
 */
export async function elementToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: false,
    style: { transform: "none", transformOrigin: "top left" },
  });
  const res = await fetch(dataUrl);
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function slidesToZip(blobs: Blob[], baseName: string): Promise<Blob> {
  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    zip.file(`${baseName}-${String(i + 1).padStart(2, "0")}.png`, blob);
  });
  return zip.generateAsync({ type: "blob" });
}

export function safeFileName(title: string): string {
  return (title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "post";
}
