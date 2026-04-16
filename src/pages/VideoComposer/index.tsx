import { Helmet } from 'react-helmet-async';
import VideoComposerDashboard from '@/components/video-composer/VideoComposerDashboard';

const VideoComposer = () => {
  return (
    <>
      <Helmet>
        <title>Motion Studio | AdTool</title>
        <meta name="description" content="Create professional videos with AI-powered scene-based assembly. Product ads, storytelling, corporate videos." />
      </Helmet>
      <VideoComposerDashboard />
    </>
  );
};

export default VideoComposer;
