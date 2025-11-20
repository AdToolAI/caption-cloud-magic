import { Composition } from 'remotion';
import { ProductAd, ProductAdSchema } from './templates/ProductAd';
import { InstagramStory, InstagramStorySchema } from './templates/InstagramStory';
import { TikTokReel, TikTokReelSchema } from './templates/TikTokReel';
import { Testimonial, TestimonialSchema } from './templates/Testimonial';
import { Tutorial, TutorialSchema } from './templates/Tutorial';

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
    </>
  );
};
