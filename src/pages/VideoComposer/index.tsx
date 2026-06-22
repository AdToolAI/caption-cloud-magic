import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import VideoComposerDashboard from '@/components/video-composer/VideoComposerDashboard';
import MotionStudioStage from '@/components/video-composer/stage/MotionStudioStage';
import { trackFeatureUsage } from '@/lib/featureUsageTracker';

const VideoComposer = () => {
  useEffect(() => {
    trackFeatureUsage('video_composer');
  }, []);

  return (
    <>
      <Helmet>
        <title>Motion Studio | AdTool</title>
        <meta name="description" content="Create professional videos with AI-powered scene-based assembly. Product ads, storytelling, corporate videos." />
      </Helmet>
      <MotionStudioStage>
        <VideoComposerDashboard />
      </MotionStudioStage>
    </>
  );
};

export default VideoComposer;
