import { useNavigate } from 'react-router-dom';
import { useEventEmitter } from '@/hooks/useEventEmitter';

/**
 * Hook to enable trend → Generator prefill workflow
 * When users bookmark a trend, they can quickly generate content
 */
export function useTrendPrefill() {
  const navigate = useNavigate();
  const { emit } = useEventEmitter();

  const openGeneratorWithTrend = async (trendName: string, trendDescription: string, platform: string = 'instagram') => {
    // Create prefill content from trend
    const prefillText = `${trendName}: ${trendDescription}`;
    
    // Emit bookmark event
    await emit({
      event_type: 'trend.bookmarked',
      source: 'trend_radar',
      payload: {
        trend_name: trendName,
        platform,
        opened_generator: true,
      },
    }, { silent: true });

    // Navigate to generator with prefilled content
    navigate(`/generator?prefill=${encodeURIComponent(prefillText)}&platform=${platform}`);
  };

  return { openGeneratorWithTrend };
}
