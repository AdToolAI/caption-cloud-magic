import { Helmet } from 'react-helmet-async';
import VideoComposerDashboard from '@/components/video-composer/VideoComposerDashboard';

const VideoComposer = () => {
  return (
    <>
      <Helmet>
        <title>AI Video Composer | AdTool</title>
        <meta name="description" content="Create professional video ads with AI-powered scene-based assembly. Product ads, storytelling, corporate videos." />
      </Helmet>
      <VideoComposerDashboard />
    </>
  );
};

export default VideoComposer;
