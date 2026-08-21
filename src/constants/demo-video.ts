import demoAsset from '@/assets/adtool-demo.mp4.asset.json';
import demoAssetDe from '@/assets/adtool-demo-de.mp4.asset.json';

// Sprachabhängige Demo-Datei; der alte Remotion-S3-Render ist abgelaufen (404).
export const getDemoVideoUrl = (language?: string): string =>
  (language === 'de' ? demoAssetDe.url : demoAsset.url);

export const DEMO_VIDEO = {
  id: 'demo-video-001',
  user_id: 'system',
  template_id: '',
  customizations: {},
  render_id: null,
  status: 'completed' as const,
  output_url: demoAsset.url,
  error_message: null,
  credits_used: 0,
  created_at: '2026-04-08T19:47:00.000Z',
  updated_at: '2026-04-08T19:47:00.000Z',
  metadata: { source: 'directors-cut', is_demo: true, title: 'Demo Video — Director\'s Cut' },
  thumbnail_url: null,
  download_count: 0,
  share_count: 0,
};

export const isDemoVideo = (video: any): boolean =>
  video?.id === DEMO_VIDEO.id || (video?.metadata as any)?.is_demo === true;
