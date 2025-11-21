import type { BackgroundAsset } from '@/types/background-assets';

/**
 * Maps BackgroundAsset from the database to UniversalVideo's background prop format
 */
export function mapBackgroundAssetToUniversalVideo(asset: BackgroundAsset | null | undefined) {
  if (!asset) {
    return {
      type: 'color' as const,
      color: '#000000',
    };
  }

  switch (asset.type) {
    case 'color':
      return {
        type: 'color' as const,
        color: asset.color || '#000000',
      };

    case 'gradient':
      return {
        type: 'gradient' as const,
        gradientColors: asset.gradient_colors?.colors || ['#000000', '#333333'],
      };

    case 'image':
      return {
        type: 'image' as const,
        imageUrl: asset.url || asset.storage_path || '',
      };

    case 'video':
      return {
        type: 'video' as const,
        videoUrl: asset.url || asset.storage_path || '',
      };

    default:
      return {
        type: 'color' as const,
        color: '#000000',
      };
  }
}
