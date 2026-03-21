import { Composition } from 'remotion';
import { ProductAd, ProductAdSchema } from './templates/ProductAd';
import { InstagramStory, InstagramStorySchema } from './templates/InstagramStory';
import { TikTokReel, TikTokReelSchema } from './templates/TikTokReel';
import { Testimonial, TestimonialSchema } from './templates/Testimonial';
import { Tutorial, TutorialSchema } from './templates/Tutorial';
import { UniversalVideo, UniversalVideoSchema } from './templates/UniversalVideo';
import { DirectorsCutVideo, DirectorsCutVideoSchema } from './templates/DirectorsCutVideo';
import { LongFormVideo, LongFormVideoSchema } from './templates/LongFormVideo';
import { ExplainerVideo, ExplainerVideoSchema } from './templates/ExplainerVideo';
import { UniversalCreatorVideo, UniversalCreatorVideoSchema } from './templates/UniversalCreatorVideo';
import { SmokeTestVideo } from './templates/SmokeTestVideo';
import { AudioSmokeTest, AudioSmokeTestSchema } from './templates/AudioSmokeTest';

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
          try {
            // Calculate duration dynamically from voiceover or scenes
            const voiceoverDuration = Number(props.voiceoverDuration) || 0;
            const scenes = Array.isArray(props.scenes) ? props.scenes : [];
            const scenesDuration = scenes.reduce((sum: number, s: any) => {
              const dur = Number(s?.duration);
              return sum + (isNaN(dur) || dur <= 0 ? 0 : dur);
            }, 0);
            const totalDuration = voiceoverDuration > 0 ? voiceoverDuration : (scenesDuration > 0 ? scenesDuration : 30);
            
            // Dynamic dimensions from inputProps (4K support)
            const width = Math.max(100, Number(props.targetWidth) || 1080);
            const height = Math.max(100, Number(props.targetHeight) || 1920);
            
            // Calculate frames with validation
            const calculatedFrames = Math.ceil(totalDuration * 30);
            const durationInFrames = Math.max(1, isFinite(calculatedFrames) ? calculatedFrames : 900);
            
            console.log('[UniversalVideo calculateMetadata]', { totalDuration, durationInFrames, width, height });
            
            return { durationInFrames, fps: 30, width, height };
          } catch (error) {
            console.error('[UniversalVideo calculateMetadata] Error:', error);
            return { durationInFrames: 900, fps: 30, width: 1080, height: 1920 };
          }
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
          try {
            const duration = Math.max(1, Number(props.durationInSeconds) || 30);
            const width = Math.max(100, Number(props.targetWidth) || 1920);
            const height = Math.max(100, Number(props.targetHeight) || 1080);
            
            const calculatedFrames = Math.ceil(duration * 30);
            const durationInFrames = Math.max(1, isFinite(calculatedFrames) ? calculatedFrames : 900);
            
            console.log('[DirectorsCutVideo calculateMetadata]', { duration, durationInFrames, width, height });
            
            return { durationInFrames, fps: 30, width, height };
          } catch (error) {
            console.error('[DirectorsCutVideo calculateMetadata] Error:', error);
            return { durationInFrames: 900, fps: 30, width: 1920, height: 1080 };
          }
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
      <Composition
        id="LongFormVideo"
        component={LongFormVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        schema={LongFormVideoSchema}
        calculateMetadata={async ({ props }) => {
          try {
            const scenes = Array.isArray(props.scenes) ? props.scenes : [];
            const fps = Math.max(1, Number(props.fps) || 30);
            
            // Calculate total duration from all scenes with validation
            const totalDuration = scenes.reduce((sum: number, s: any) => {
              const dur = Number(s?.duration);
              return sum + (isNaN(dur) || dur <= 0 ? 5 : dur);
            }, 0) || 30;
            
            // Determine dimensions based on aspect ratio (default 16:9)
            const aspectRatio = (props as any).aspectRatio || '16:9';
            let width = 1920;
            let height = 1080;
            
            if (aspectRatio === '9:16') {
              width = 1080;
              height = 1920;
            } else if (aspectRatio === '1:1') {
              width = 1080;
              height = 1080;
            }
            
            const calculatedFrames = Math.ceil(totalDuration * fps);
            const durationInFrames = Math.max(1, isFinite(calculatedFrames) ? calculatedFrames : 900);
            
            console.log('[LongFormVideo calculateMetadata]', { scenes: scenes.length, totalDuration, fps, durationInFrames });
            
            return { durationInFrames, fps, width, height };
          } catch (error) {
            console.error('[LongFormVideo calculateMetadata] Error:', error);
            return { durationInFrames: 900, fps: 30, width: 1920, height: 1080 };
          }
        }}
        defaultProps={{
          scenes: [],
          fps: 30,
        }}
      />
      <Composition
        id="ExplainerVideo"
        component={ExplainerVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        schema={ExplainerVideoSchema}
        calculateMetadata={async ({ props }) => {
          // CRITICAL: Wrap EVERYTHING in try-catch with GUARANTEED fallback
          try {
            const rawScenes = props.scenes;
            const fps = 30;
            
            // Absolute safety check - return fallback immediately if no valid array
            if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
              console.error('[ExplainerVideo FALLBACK] No scenes array or empty');
              return { durationInFrames: 900, fps: 30, width: 1920, height: 1080 };
            }
            
            // Parse and validate each scene duration individually
            let totalFrames = 0;
            let validSceneCount = 0;
            
            for (let i = 0; i < rawScenes.length; i++) {
              const scene = rawScenes[i];
              const dur = Number(scene?.durationSeconds);
              
              if (Number.isFinite(dur) && dur > 0) {
                totalFrames += Math.ceil(dur * fps);
                validSceneCount++;
              } else {
                console.error(`[ExplainerVideo] Invalid scene ${i}: durationSeconds=${scene?.durationSeconds} -> parsed=${dur}`);
              }
            }
            
            // CRITICAL: Ensure totalFrames is ALWAYS valid
            if (!Number.isFinite(totalFrames) || totalFrames < 2 || validSceneCount === 0) {
              console.error('[ExplainerVideo FALLBACK] Invalid totalFrames or no valid scenes:', { totalFrames, validSceneCount });
              return { durationInFrames: 900, fps: 30, width: 1920, height: 1080 };
            }
            
            // Clamp dimensions to safe ranges
            const width = Math.max(100, Math.min(4096, Number(props.targetWidth) || 1920));
            const height = Math.max(100, Math.min(4096, Number(props.targetHeight) || 1080));
            
            // Clamp duration to reasonable range (30 frames min, 36000 frames max = 20 min at 30fps)
            const durationInFrames = Math.max(30, Math.min(36000, totalFrames));
            
            console.log('[ExplainerVideo calculateMetadata] SUCCESS:', { 
              validScenes: validSceneCount, 
              totalFrames,
              durationInFrames,
              width,
              height,
            });
            
            return { durationInFrames, fps, width, height };
          } catch (error) {
            console.error('[ExplainerVideo calculateMetadata] EXCEPTION:', error);
            return { durationInFrames: 900, fps: 30, width: 1920, height: 1080 };
          }
        }}
        defaultProps={{
          scenes: [],
          voiceoverUrl: '',
          backgroundMusicUrl: '',
          backgroundMusicVolume: 0.15,
          style: 'flat-design',
          primaryColor: '#F5C76A',
          secondaryColor: '#8B5CF6',
          showSceneTitles: true,
          showProgressBar: true,
        }}
      />
      <Composition
        id="UniversalCreatorVideo"
        component={UniversalCreatorVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        schema={UniversalCreatorVideoSchema}
        calculateMetadata={async ({ props }) => {
          // CRITICAL: Wrap EVERYTHING in try-catch with GUARANTEED fallback
          try {
            const rawScenes = props.scenes;
            const fps = Math.max(1, Math.min(60, Number(props.fps) || 30));
            
            // Absolute safety check - return fallback immediately if no valid array
            if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
              console.error('[UniversalCreatorVideo FALLBACK] No scenes array or empty');
              return { durationInFrames: 900, fps: 30, width: 1080, height: 1920 };
            }
            
            // Parse and validate each scene duration individually
            let totalFrames = 0;
            let validSceneCount = 0;
            
            for (let i = 0; i < rawScenes.length; i++) {
              const scene = rawScenes[i];
              const dur = Number(scene?.duration);
              
              if (Number.isFinite(dur) && dur > 0) {
                totalFrames += Math.ceil(dur * fps);
                validSceneCount++;
              } else {
                console.error(`[UniversalCreatorVideo] Invalid scene ${i}: duration=${scene?.duration} -> parsed=${dur}`);
              }
            }
            
            // CRITICAL: Ensure totalFrames is ALWAYS valid
            if (!Number.isFinite(totalFrames) || totalFrames < 2 || validSceneCount === 0) {
              console.error('[UniversalCreatorVideo FALLBACK] Invalid totalFrames or no valid scenes:', { totalFrames, validSceneCount });
              return { durationInFrames: 900, fps: 30, width: 1080, height: 1920 };
            }
            
            // Clamp dimensions to safe ranges
            const width = Math.max(100, Math.min(4096, Number(props.targetWidth) || 1080));
            const height = Math.max(100, Math.min(4096, Number(props.targetHeight) || 1920));
            
            // Clamp duration to reasonable range (30 frames min, 36000 frames max = 20 min at 30fps)
            const durationInFrames = Math.max(30, Math.min(36000, totalFrames));
            
            console.log('[UniversalCreatorVideo calculateMetadata] SUCCESS:', { 
              validScenes: validSceneCount, 
              totalFrames, 
              fps, 
              durationInFrames,
              width,
              height,
            });
            
            return { durationInFrames, fps, width, height };
          } catch (error) {
            console.error('[UniversalCreatorVideo calculateMetadata] EXCEPTION:', error);
            return { durationInFrames: 900, fps: 30, width: 1080, height: 1920 };
          }
        }}
        defaultProps={{
          scenes: [],
          subtitles: [],
          voiceoverUrl: '',
          backgroundMusicUrl: '',
          backgroundMusicVolume: 0.2,
          masterVolume: 1.0,
          category: 'social-reel',
          storytellingStructure: 'hook-problem-solution',
          primaryColor: '#F5C76A',
          secondaryColor: '#22d3ee',
          fontFamily: 'Inter',
          showProgressBar: false,
          showWatermark: false,
        }}
      />
      <Composition
        id="SmokeTest"
        component={SmokeTestVideo}
        durationInFrames={60}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="AudioSmokeTest"
        component={AudioSmokeTest}
        durationInFrames={60}
        fps={30}
        width={640}
        height={360}
        schema={AudioSmokeTestSchema}
        defaultProps={{
          audioUrl: '',
        }}
      />
    </>
  );
};
