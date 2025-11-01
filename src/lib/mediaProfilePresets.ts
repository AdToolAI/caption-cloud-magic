import { MediaProfileConfig, Platform } from './mediaProfileSchema';

export interface PresetDefinition {
  name: string;
  description: string;
  config: MediaProfileConfig;
}

export const PLATFORM_PRESETS: Record<Platform, Record<string, PresetDefinition>> = {
  instagram: {
    'feed-1-1': {
      name: 'Feed 1:1',
      description: 'Quadratisches Feed-Post (1080x1080)',
      config: {
        aspect: '1:1',
        width: 1080,
        height: 1080,
        fitMode: 'cover',
        sizeLimitMb: 30,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] },
        safeMargins: { top: 50, bottom: 50, left: 50, right: 50 }
      }
    },
    'feed-4-5': {
      name: 'Feed 4:5',
      description: 'Vertikales Feed-Post (1080x1350)',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 30,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'story-9-16': {
      name: 'Story/Reel 9:16',
      description: 'Story oder Reel (1080x1920)',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 100,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 90,
          minDurationSec: 3,
          targetFps: 30,
          targetBitrateMbps: 5,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 128
        },
        safeMargins: { top: 250, bottom: 250, left: 0, right: 0 }
      }
    }
  },
  tiktok: {
    'video-9-16': {
      name: 'TikTok Video 9:16',
      description: 'Standard TikTok Video (1080x1920)',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 287,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 600,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 10,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 128
        },
        safeMargins: { top: 200, bottom: 300, left: 0, right: 0 }
      }
    }
  },
  youtube: {
    'short-9-16': {
      name: 'YouTube Short 9:16',
      description: 'YouTube Short (1080x1920)',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 256,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 60,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 8,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 192
        }
      }
    },
    'standard-16-9': {
      name: 'Standard Video 16:9',
      description: 'Standard YouTube Video Full HD (1920x1080)',
      config: {
        aspect: '16:9',
        width: 1920,
        height: 1080,
        fitMode: 'cover',
        sizeLimitMb: 256,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 43200,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 10,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 192
        }
      }
    }
  },
  x: {
    'image-16-9': {
      name: 'Image 16:9',
      description: 'Landscape Image (1200x675)',
      config: {
        aspect: '16:9',
        width: 1200,
        height: 675,
        fitMode: 'cover',
        sizeLimitMb: 5,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'image-4-5': {
      name: 'Image 4:5',
      description: 'Portrait Image (1080x1350)',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 5,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  },
  facebook: {
    'post-1-1': {
      name: 'Post 1:1',
      description: 'Square Post (1200x1200)',
      config: {
        aspect: '1:1',
        width: 1200,
        height: 1200,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'post-4-5': {
      name: 'Post 4:5',
      description: 'Vertical Post (1080x1350)',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  },
  linkedin: {
    'post-1-1': {
      name: 'Post 1:1',
      description: 'Square Post (1200x1200)',
      config: {
        aspect: '1:1',
        width: 1200,
        height: 1200,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'post-16-9': {
      name: 'Post 16:9',
      description: 'Landscape Post (1200x675)',
      config: {
        aspect: '16:9',
        width: 1200,
        height: 675,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  }
};

export function getPresetsForPlatform(platform: Platform): PresetDefinition[] {
  return Object.values(PLATFORM_PRESETS[platform] || {});
}

export function getPreset(platform: Platform, presetKey: string): PresetDefinition | null {
  return PLATFORM_PRESETS[platform]?.[presetKey] || null;
}
