import { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { VIDEO_CATEGORIES, type VideoCategoryInfo, type VideoCategory } from '@/types/universal-video-creator';

/**
 * Returns VIDEO_CATEGORIES with names/descriptions/features localized
 * based on the current language. Falls back to the original German data.
 */
export function useLocalizedVideoCategories(): VideoCategoryInfo[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const catKeyMap: Record<VideoCategory, string> = {
      advertisement: 'cat_advertisement',
      storytelling: 'cat_storytelling',
      tutorial: 'cat_tutorial',
      'product-video': 'cat_product',
      corporate: 'cat_corporate',
      'social-content': 'cat_social',
      testimonial: 'cat_testimonial',
      explainer: 'cat_explainer',
      event: 'cat_event',
      promo: 'cat_promo',
      presentation: 'cat_presentation',
      custom: 'cat_custom',
    };

    return VIDEO_CATEGORIES.map((cat) => {
      const key = catKeyMap[cat.category];
      if (!key) return cat;

      const name = t(`uvc.${key}`);
      const desc = t(`uvc.${key}_desc`);
      const duration = t(`uvc.${key}_duration`);
      const useCase = t(`uvc.${key}_usecase`);
      const f1 = t(`uvc.${key}_f1`);
      const f2 = t(`uvc.${key}_f2`);
      const f3 = t(`uvc.${key}_f3`);

      return {
        ...cat,
        name: typeof name === 'string' && !name.startsWith('uvc.') ? name : cat.name,
        description: typeof desc === 'string' && !desc.startsWith('uvc.') ? desc : cat.description,
        recommendedDuration: typeof duration === 'string' && !duration.startsWith('uvc.') ? duration : cat.recommendedDuration,
        exampleUseCase: typeof useCase === 'string' && !useCase.startsWith('uvc.') ? useCase : cat.exampleUseCase,
        features: [
          typeof f1 === 'string' && !f1.startsWith('uvc.') ? f1 : cat.features[0],
          typeof f2 === 'string' && !f2.startsWith('uvc.') ? f2 : cat.features[1],
          typeof f3 === 'string' && !f3.startsWith('uvc.') ? f3 : cat.features[2],
        ],
      };
    });
  }, [t]);
}

/** Get a single localized category name by its key */
export function useLocalizedCategoryName(category: VideoCategory | null): string {
  const categories = useLocalizedVideoCategories();
  if (!category) return '';
  return categories.find((c) => c.category === category)?.name || '';
}
