export const DEMO_VIDEO = {
  id: 'demo-video-001',
  user_id: 'system',
  template_id: '',
  customizations: {},
  render_id: null,
  status: 'completed' as const,
  output_url: 'https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-13gm4o6s90/renders/w25s7m56p8/directors-cut-f19f61ff-9253-40da-9e49-31ac870f8557.mp4',
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
