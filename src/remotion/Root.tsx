import { Composition } from 'remotion';
import { ProductAd, ProductAdSchema } from './templates/ProductAd';
import { InstagramStory, InstagramStorySchema } from './templates/InstagramStory';
import { TikTokReel, TikTokReelSchema } from './templates/TikTokReel';
import { Testimonial, TestimonialSchema } from './templates/Testimonial';
import { Tutorial, TutorialSchema } from './templates/Tutorial';
import { UniversalVideo, UniversalVideoSchema } from './templates/UniversalVideo';
import { DirectorsCutVideo, DirectorsCutVideoSchema } from './templates/DirectorsCutVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductAd"
        component={ProductAd}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        schema={ProductAdSchema}
        defaultProps={{
          imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
          productName: 'Your Product',
          tagline: 'Amazing product description',
          ctaText: 'Shop Now',
        }}
      />
      <Composition
        id="InstagramStory"
        component={InstagramStory}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        schema={InstagramStorySchema}
        defaultProps={{
          backgroundUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926',
          headline: 'Story Headline',
          text: 'Your story content here',
        }}
      />
      <Composition
        id="TikTokReel"
        component={TikTokReel}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        schema={TikTokReelSchema}
        defaultProps={{
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          overlayText: 'Watch This!',
          hashtags: '#viral #trending',
        }}
      />
      <Composition
        id="Testimonial"
        component={Testimonial}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        schema={TestimonialSchema}
        defaultProps={{
          customerName: 'John Doe',
          testimonialText: 'This product changed my life!',
          rating: 5,
          customerPhoto: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e',
        }}
      />
      <Composition
        id="Tutorial"
        component={Tutorial}
        durationInFrames={1200}
        fps={30}
        width={1920}
        height={1080}
        schema={TutorialSchema}
        defaultProps={{
          title: 'How to Tutorial',
          steps: ['Step 1', 'Step 2', 'Step 3'],
          voiceoverUrl: '',
        }}
      />
      <Composition
        id="UniversalVideo"
        component={UniversalVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        schema={UniversalVideoSchema}
        calculateMetadata={async ({ props }) => {
          // Calculate duration dynamically from voiceover or scenes
          const voiceoverDuration = props.voiceoverDuration || 0;
          const scenes = Array.isArray(props.scenes) ? props.scenes : [];
          const scenesDuration = scenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0) || 0;
          const totalDuration = voiceoverDuration || scenesDuration || 30;
          
          // Dynamic dimensions from inputProps (4K support)
          const width = (props.targetWidth as number) || 1080;
          const height = (props.targetHeight as number) || 1920;
          
          return {
            durationInFrames: Math.ceil(totalDuration * 30), // 30fps
            width,
            height,
          };
        }}
        defaultProps={{
          voiceoverUrl: '',
          voiceoverDuration: 30,
          backgroundMusicUrl: '',
          backgroundMusicVolume: 0.3,
          subtitles: [],
          subtitleStyle: {
            position: 'bottom',
            font: 'Arial',
            fontSize: 48,
            color: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundOpacity: 0.7,
            animation: 'none',
            outlineStyle: 'none',
            outlineColor: '#000000',
            outlineWidth: 2,
          },
          background: {
            type: 'color',
            color: '#000000',
          },
        }}
      />
      <Composition
        id="DirectorsCutVideo"
        component={DirectorsCutVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        schema={DirectorsCutVideoSchema}
        calculateMetadata={async ({ props }) => {
          const duration = (props.durationInSeconds as number) || 30;
          const width = (props.targetWidth as number) || 1920;
          const height = (props.targetHeight as number) || 1080;
          
          return {
            durationInFrames: Math.ceil(duration * 30),
            width,
            height,
          };
        }}
        defaultProps={{
          sourceVideoUrl: '',
          brightness: 100,
          contrast: 100,
          saturation: 100,
          sharpness: 0,
          temperature: 0,
          vignette: 0,
          masterVolume: 100,
          durationInSeconds: 30,
        }}
      />
    </>
  );
};
