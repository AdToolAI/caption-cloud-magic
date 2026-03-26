export const DEMO_VIDEO = {
  id: 'demo-video-001',
  user_id: 'system',
  template_id: '',
  customizations: {},
  render_id: null,
  status: 'completed' as const,
  output_url: 'https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-13gm4o6s90/renders/iqab67nz53/out.mp4',
  error_message: null,
  credits_used: 0,
  created_at: '2026-03-26T17:07:34.954Z',
  updated_at: '2026-03-26T17:07:34.954Z',
  metadata: { source: 'universal-creator', is_demo: true, title: 'Demo Video — Universal Creator' },
  thumbnail_url: null,
  download_count: 0,
  share_count: 0,
};

export const isDemoVideo = (video: any): boolean =>
  video?.id === DEMO_VIDEO.id || (video?.metadata as any)?.is_demo === true;
