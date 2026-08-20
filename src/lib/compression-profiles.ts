import { tx } from "@/lib/i18nText";
export interface CompressionProfile {
  id: string;
  label: string;
  resolution: string;
  bitrate: string;
  fps: number;
  codec: string;
  description: string;
}

export const COMPRESSION_PROFILES: CompressionProfile[] = [
  {
    id: '4k',
    label: '4K Ultra HD',
    resolution: '3840x2160',
    bitrate: '20000k',
    fps: 30,
    codec: 'h264',
    description: tx({ de: 'Höchste Qualität für große Bildschirme und professionelle Anwendungen', en: 'Highest quality for large screens and professional applications', es: 'Máxima calidad para pantallas grandes y aplicaciones profesionales' })
  },
  {
    id: '1080p',
    label: '1080p Full HD',
    resolution: '1920x1080',
    bitrate: '8000k',
    fps: 30,
    codec: 'h264',
    description: tx({ de: 'Optimales Gleichgewicht zwischen Qualität und Dateigröße', en: 'Optimal balance between quality and file size', es: 'Equilibrio óptimo entre calidad y tamaño de archivo' })
  },
  {
    id: '720p',
    label: '720p HD',
    resolution: '1280x720',
    bitrate: '4000k',
    fps: 30,
    codec: 'h264',
    description: tx({ de: 'Gute Qualität mit kleinerer Dateigröße', en: 'Good quality with smaller file size', es: 'Buena calidad con un tamaño de archivo más pequeño' })
  },
  {
    id: '480p',
    label: '480p SD',
    resolution: '854x480',
    bitrate: '2000k',
    fps: 30,
    codec: 'h264',
    description: tx({ de: 'Kompakte Dateigröße für mobile Geräte und langsame Verbindungen', en: 'Compact file size for mobile devices and slow connections', es: 'Tamaño de archivo compacto para dispositivos móviles y conexiones lentas' })
  }
];

export interface FormatProfile {
  id: string;
  label: string;
  extension: string;
  mimeType: string;
  codec: string;
  description: string;
}

export const FORMAT_PROFILES: FormatProfile[] = [
  {
    id: 'mp4',
    label: 'MP4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    codec: 'h264',
    description: tx({ de: 'Universal kompatibel, beste Wahl für Social Media', en: 'Universal compatible, best choice for social media', es: 'Compatible universal, la mejor opción para las redes sociales' })
  },
  {
    id: 'webm',
    label: 'WebM',
    extension: 'webm',
    mimeType: 'video/webm',
    codec: 'vp9',
    description: tx({ de: 'Optimiert für Web, kleinere Dateigröße bei gleicher Qualität', en: 'Optimized for web, smaller file size with the same quality', es: 'Optimizado para web, tamaño de archivo más pequeño con la misma calidad' })
  },
  {
    id: 'gif',
    label: 'GIF',
    extension: 'gif',
    mimeType: 'image/gif',
    codec: 'gif',
    description: tx({ de: 'Animiert, ideal für kurze Loops und Vorschau', en: 'Animated, ideal for short loops and preview', es: 'Animado, ideal para bucles cortos y vista previa' })
  }
];

export interface AspectRatioProfile {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  platforms: string[];
  description: string;
}

export const ASPECT_RATIO_PROFILES: AspectRatioProfile[] = [
  {
    id: '9:16',
    label: 'Vertikal (9:16)',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    platforms: ['Instagram Stories', 'TikTok', 'Reels', 'YouTube Shorts'],
    description: tx({ de: 'Perfekt für mobile Stories und Shorts', en: 'Perfect for mobile stories and shorts', es: 'Perfecto para historias móviles y cortos' })
  },
  {
    id: '16:9',
    label: 'Horizontal (16:9)',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    platforms: ['YouTube', 'Facebook', 'LinkedIn'],
    description: tx({ de: 'Standard für Desktop und TV', en: 'Standard for desktop and TV', es: 'Estándar para escritorio y TV' })
  },
  {
    id: '1:1',
    label: tx({ de: "Quadratisch (1:1)", en: "Square (1:1)", es: "Cuadrado (1:1)" }),
    ratio: '1:1',
    width: 1080,
    height: 1080,
    platforms: ['Instagram Feed', 'Facebook', 'LinkedIn'],
    description: tx({ de: 'Optimiert für Feed-Posts', en: 'Optimized for feed posts', es: 'Optimizado para publicaciones de feeds' })
  },
  {
    id: '4:5',
    label: 'Portrait (4:5)',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    platforms: ['Instagram Feed'],
    description: tx({ de: 'Maximale Feed-Sichtbarkeit auf Instagram', en: 'Maximum feed visibility on Instagram', es: 'Máxima visibilidad del feed en Instagram' })
  }
];

export function getCompressionProfile(id: string): CompressionProfile | undefined {
  return COMPRESSION_PROFILES.find(p => p.id === id);
}

export function getFormatProfile(id: string): FormatProfile | undefined {
  return FORMAT_PROFILES.find(p => p.id === id);
}

export function getAspectRatioProfile(id: string): AspectRatioProfile | undefined {
  return ASPECT_RATIO_PROFILES.find(p => p.id === id);
}

export function calculateEstimatedFileSize(
  durationSec: number,
  quality: string,
  format: string
): number {
  const profile = getCompressionProfile(quality);
  if (!profile) return 0;

  // Extract bitrate number (e.g., "8000k" -> 8000)
  const bitrate = parseInt(profile.bitrate.replace('k', ''));
  
  // Calculate size in MB: (bitrate * duration) / 8 / 1024
  const sizeInMB = (bitrate * durationSec) / 8 / 1024;

  // Apply format multiplier
  const formatMultiplier = format === 'webm' ? 0.8 : format === 'gif' ? 1.5 : 1.0;
  
  return Math.round(sizeInMB * formatMultiplier * 100) / 100;
}
