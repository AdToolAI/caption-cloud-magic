import React, { useEffect } from 'react';
import { AbsoluteFill, Audio, Video, interpolate, Sequence, useCurrentFrame, useVideoConfig, delayRender, continueRender, staticFile } from 'remotion';
import { z } from 'zod';
import { FadeTransition } from '../components/transitions/FadeTransition';
import { SlideTransition } from '../components/transitions/SlideTransition';
import { ZoomTransition } from '../components/transitions/ZoomTransition';
import { WipeTransition } from '../components/transitions/WipeTransition';
import { BlurTransition } from '../components/transitions/BlurTransition';
import { PushTransition } from '../components/transitions/PushTransition';

// Font: Inter loaded via native FontFace API
const fontFamily = 'Inter';

const SceneSchema = z.object({
  id: z.string(),
  order: z.number(),
  duration: z.number(),
  background: z.object({
    type: z.enum(['color', 'gradient', 'video', 'image']),
    color: z.string().optional(),
    gradientColors: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
    imageUrl: z.string().optional(),
  }),
  transition: z.object({
    type: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push']),
    duration: z.number(),
    direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  }),
  backgroundAnimation: z.object({
    type: z.enum(['none', 'zoomIn', 'panLeft', 'panRight', 'panUp', 'panDown']),
    intensity: z.number().optional(),
  }).optional(),
});

export const UniversalVideoSchema = z.object({
  voiceoverUrl: z.string().optional(),
  voiceoverDuration: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
  targetWidth: z.number().optional(),
  targetHeight: z.number().optional(),
  subtitles: z.array(z.object({
    id: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    text: z.string(),
    words: z.array(z.object({
      text: z.string(),
      startTime: z.number(),
      endTime: z.number(),
    })),
  })).optional(),
  subtitleStyle: z.object({
    position: z.enum(['top', 'center', 'bottom']),
    font: z.string(),
    fontSize: z.number(),
    color: z.string(),
    backgroundColor: z.string(),
    backgroundOpacity: z.number(),
    animation: z.enum(['none', 'fade', 'slide', 'bounce', 'typewriter', 'highlight', 'scaleUp', 'glitch']),
    animationSpeed: z.number(),
    outlineStyle: z.enum(['none', 'stroke', 'box', 'box-stroke', 'glow', 'shadow']),
    outlineColor: z.string(),
    outlineWidth: z.number(),
  }).optional(),
  background: z.object({
    type: z.enum(['color', 'gradient', 'video', 'image']),
    color: z.string().optional(),
    gradientColors: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
    imageUrl: z.string().optional(),
  }).optional(),
  scenes: z.array(SceneSchema).optional(),
});

type UniversalVideoProps = z.infer<typeof UniversalVideoSchema>;
type Scene = z.infer<typeof SceneSchema>;

const BackgroundLayer: React.FC<{ background?: UniversalVideoProps['background'] }> = ({ background }) => {
  if (!background) {
    return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
  }

  if (background.type === 'color') {
    return <AbsoluteFill style={{ backgroundColor: background.color || '#000000' }} />;
  }

  if (background.type === 'gradient' && background.gradientColors) {
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${background.gradientColors[0] || '#000000'}, ${background.gradientColors[1] || '#333333'})`,
        }}
      />
    );
  }

  if (background.type === 'image' && background.imageUrl) {
    return (
      <AbsoluteFill>
        <img
          src={background.imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (background.type === 'video' && background.videoUrl) {
    return (
      <AbsoluteFill>
        <Video
          src={background.videoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          loop
          muted
        />
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
};

const SubtitleLayer: React.FC<{
  subtitles?: UniversalVideoProps['subtitles'];
  subtitleStyle?: UniversalVideoProps['subtitleStyle'];
}> = ({ subtitles, subtitleStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;


  if (!subtitles || !subtitleStyle) return null;

  const currentSegment = subtitles.find(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );

  if (!currentSegment) return null;

  const currentWord = currentSegment.words.find(
    (word) => currentTime >= word.startTime && currentTime <= word.endTime
  );

  const getAnimationStyle = () => {
    if (subtitleStyle.animation === 'none') return {};

    const segmentProgress = (currentTime - currentSegment.startTime) / (currentSegment.endTime - currentSegment.startTime);

    if (subtitleStyle.animation === 'fade') {
      const opacity = interpolate(segmentProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }

    if (subtitleStyle.animation === 'slide') {
      const translateY = interpolate(segmentProgress, [0, 0.15], [50, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { transform: `translateY(${translateY}px)` };
    }

    if (subtitleStyle.animation === 'bounce') {
      const scale = interpolate(segmentProgress, [0, 0.1, 0.2], [0.8, 1.1, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { transform: `scale(${scale})` };
    }

    return {};
  };

  const getOutlineStyle = () => {
    if (subtitleStyle.outlineStyle === 'none') return {};

    if (subtitleStyle.outlineStyle === 'stroke') {
      return {
        WebkitTextStroke: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'box') {
      return {
        backgroundColor: subtitleStyle.backgroundColor,
        padding: '8px 16px',
        borderRadius: '8px',
      };
    }

    if (subtitleStyle.outlineStyle === 'box-stroke') {
      return {
        backgroundColor: subtitleStyle.backgroundColor,
        padding: '8px 16px',
        borderRadius: '8px',
        border: `${subtitleStyle.outlineWidth}px solid ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'glow') {
      return {
        textShadow: `0 0 ${subtitleStyle.outlineWidth * 2}px ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'shadow') {
      return {
        textShadow: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth * 2}px ${subtitleStyle.outlineColor}`,
      };
    }

    return {};
  };

  const getPositionStyles = () => {
    switch (subtitleStyle.position) {
      case 'top':
        return {
          justifyContent: 'flex-start',
          paddingTop: '5%',
        };
      case 'center':
        return {
          justifyContent: 'center',
        };
      case 'bottom':
      default:
        return {
          justifyContent: 'flex-end',
          paddingBottom: '5%',
        };
    }
  };

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        ...getPositionStyles(),
      }}
    >
      <div
        style={{
          fontFamily: fontFamily,
          fontSize: subtitleStyle.fontSize,
          color: subtitleStyle.color,
          textAlign: 'center',
          maxWidth: '80%',
          ...getOutlineStyle(),
          ...getAnimationStyle(),
        }}
      >
        {(() => {
          // Teile Wörter in 3 Zeilen auf
          const wordsPerLine = Math.ceil(currentSegment.words.length / 3);
          const lines = [
            currentSegment.words.slice(0, wordsPerLine),
            currentSegment.words.slice(wordsPerLine, wordsPerLine * 2),
            currentSegment.words.slice(wordsPerLine * 2),
          ].filter(line => line.length > 0);

          return lines.map((lineWords, lineIndex) => (
            <div key={lineIndex} style={{ display: 'block', marginBottom: lineIndex < lines.length - 1 ? '0.2em' : '0' }}>
              {lineWords.map((word, wordIndex) => (
                <span
                  key={wordIndex}
                  style={{
                    fontWeight: currentWord?.text === word.text ? 'bold' : 'normal',
                    marginRight: '0.3em',
                  }}
                >
                  {word.text}
                </span>
              ))}
            </div>
          ));
        })()}
      </div>
    </AbsoluteFill>
  );
};

const SceneRenderer: React.FC<{
  scene: Scene;
  fps: number;
}> = ({ scene, fps }) => {
  return (
    <AbsoluteFill>
      <BackgroundLayer background={scene.background} />
    </AbsoluteFill>
  );
};

export const UniversalVideo: React.FC<UniversalVideoProps> = ({
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume = 0.3,
  subtitles,
  subtitleStyle,
  background,
  scenes,
}) => {
  // NATIVE FONTFACE API - NO @remotion/fonts PACKAGE (crashes Lambda!)
  useEffect(() => {
    const handle = delayRender('Loading Inter font via native FontFace API...');
    
    // Native FontFace API with staticFile() - OFFICIAL REMOTION DOCUMENTATION
    const font = new FontFace(
      fontFamily,
      `url('${staticFile('Inter-Regular.woff2')}') format('woff2')`,
      { weight: '400' }
    );
    
    font.load()
      .then(() => {
        document.fonts.add(font);
        console.log('[UniversalVideo] BUILD: NATIVE-FONTFACE-V15 - Font loaded via native API');
        continueRender(handle);
      })
      .catch((err) => {
        console.error('[UniversalVideo] Native FontFace error:', err);
        // Continue anyway with fallback font
        continueRender(handle);
      });
  }, []);
  
  // HOOKS DIRECTLY IN MAIN COMPONENT - with SAFE FALLBACKS
  const rawFrame = useCurrentFrame();
  const videoConfig = useVideoConfig();
  
  // SAFE FALLBACKS - prevent crashes if hooks return undefined/NaN in Lambda
  const frame = typeof rawFrame === 'number' && !isNaN(rawFrame) ? rawFrame : 0;
  const fps = typeof videoConfig?.fps === 'number' && videoConfig.fps > 0 ? videoConfig.fps : 30;
  const width = videoConfig?.width ?? 1080;
  const height = videoConfig?.height ?? 1920;
  const currentTime = frame / fps;
  
  // Calculate current subtitle segment INLINE
  const currentSubtitleSegment = subtitles?.find(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );
  
  // Find current word for highlighting
  const currentWord = currentSubtitleSegment?.words.find(
    (word) => currentTime >= word.startTime && currentTime <= word.endTime
  );
  

  // If scenes are provided, use multi-scene rendering
  if (scenes && scenes.length > 0) {
    let cumulativeFrames = 0;
    const transitionDurationFrames = 15; // 0.5 seconds at 30fps

    return (
      <AbsoluteFill>
        {scenes.map((scene, index) => {
          const sceneDurationFrames = Math.floor(scene.duration * fps);
          const startFrame = cumulativeFrames;
          
          // Add transition duration to cumulative frames
          const nextStartFrame = cumulativeFrames + sceneDurationFrames;
          cumulativeFrames = nextStartFrame;

          const isLastScene = index === scenes.length - 1;
          const nextScene = !isLastScene ? scenes[index + 1] : null;

          return (
            <React.Fragment key={scene.id}>
              {/* Main Scene */}
              <Sequence from={startFrame} durationInFrames={sceneDurationFrames}>
                {scene.transition.type === 'fade' || scene.transition.type === 'crossfade' ? (
                  <FadeTransition direction="in" durationInFrames={transitionDurationFrames}>
                    <SceneRenderer scene={scene} fps={fps} />
                  </FadeTransition>
                ) : scene.transition.type === 'slide' ? (
                  <SlideTransition
                    direction={scene.transition.direction || 'left'}
                    type="in"
                    durationInFrames={transitionDurationFrames}
                  >
                    <SceneRenderer scene={scene} fps={fps} />
                  </SlideTransition>
                ) : scene.transition.type === 'zoom' ? (
                  <ZoomTransition direction="in" durationInFrames={transitionDurationFrames}>
                    <SceneRenderer scene={scene} fps={fps} />
                  </ZoomTransition>
                ) : scene.transition.type === 'wipe' ? (
                  <WipeTransition
                    direction={scene.transition.direction || 'left'}
                    type="in"
                    durationInFrames={transitionDurationFrames}
                  >
                    <SceneRenderer scene={scene} fps={fps} />
                  </WipeTransition>
                ) : scene.transition.type === 'blur' ? (
                  <BlurTransition direction="in" durationInFrames={transitionDurationFrames}>
                    <SceneRenderer scene={scene} fps={fps} />
                  </BlurTransition>
                ) : scene.transition.type === 'push' ? (
                  <PushTransition
                    direction={scene.transition.direction || 'left'}
                    type="in"
                    durationInFrames={transitionDurationFrames}
                  >
                    <SceneRenderer scene={scene} fps={fps} />
                  </PushTransition>
                ) : (
                  <SceneRenderer scene={scene} fps={fps} />
                )}
              </Sequence>

              {/* Transition Out (if not last scene) */}
              {!isLastScene && scene.transition.type !== 'none' && (
                <Sequence from={nextStartFrame - transitionDurationFrames} durationInFrames={transitionDurationFrames}>
                  {scene.transition.type === 'fade' || scene.transition.type === 'crossfade' ? (
                    <FadeTransition direction="out" durationInFrames={transitionDurationFrames}>
                      <SceneRenderer scene={scene} fps={fps} />
                    </FadeTransition>
                  ) : scene.transition.type === 'slide' ? (
                    <SlideTransition
                      direction={scene.transition.direction || 'left'}
                      type="out"
                      durationInFrames={transitionDurationFrames}
                    >
                      <SceneRenderer scene={scene} fps={fps} />
                    </SlideTransition>
                  ) : scene.transition.type === 'zoom' ? (
                    <ZoomTransition direction="out" durationInFrames={transitionDurationFrames}>
                      <SceneRenderer scene={scene} fps={fps} />
                    </ZoomTransition>
                  ) : scene.transition.type === 'wipe' ? (
                    <WipeTransition
                      direction={scene.transition.direction || 'left'}
                      type="out"
                      durationInFrames={transitionDurationFrames}
                    >
                      <SceneRenderer scene={scene} fps={fps} />
                    </WipeTransition>
                  ) : scene.transition.type === 'blur' ? (
                    <BlurTransition direction="out" durationInFrames={transitionDurationFrames}>
                      <SceneRenderer scene={scene} fps={fps} />
                    </BlurTransition>
                  ) : scene.transition.type === 'push' ? (
                    <PushTransition
                      direction={scene.transition.direction || 'left'}
                      type="out"
                      durationInFrames={transitionDurationFrames}
                    >
                      <SceneRenderer scene={scene} fps={fps} />
                    </PushTransition>
                  ) : null}
                </Sequence>
              )}
            </React.Fragment>
          );
        })}

        {voiceoverUrl && (
          <>
            {console.log('[UniversalVideo] Voiceover URL check:', {
              url: voiceoverUrl,
              isValidUrl: voiceoverUrl.startsWith('https://'),
              isSupabaseStorage: voiceoverUrl.includes('supabase.co/storage'),
            })}
          <Audio
            src={voiceoverUrl}
            startFrom={0}
            volume={1.0}
            loop={false}
            onError={(e) => console.error('[UniversalVideo] Voiceover error:', e)}
          />
          </>
        )}
        {backgroundMusicUrl && (
          <>
            {console.log('[UniversalVideo] Background music URL check:', {
              url: backgroundMusicUrl,
              isValidUrl: backgroundMusicUrl.startsWith('https://'),
              isSupabaseStorage: backgroundMusicUrl.includes('supabase.co/storage'),
            })}
          <Audio
            src={backgroundMusicUrl}
            startFrom={0}
            volume={backgroundMusicVolume}
            loop={false}
            onError={(e) => console.error('[UniversalVideo] Background music error:', e)}
          />
          </>
        )}
        {/* INLINE SUBTITLE RENDERING - no child component with hooks */}
        {currentSubtitleSegment && subtitleStyle && (
          <AbsoluteFill style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: subtitleStyle.position === 'top' ? 'flex-start' : subtitleStyle.position === 'center' ? 'center' : 'flex-end',
            paddingTop: subtitleStyle.position === 'top' ? '5%' : 0,
            paddingBottom: subtitleStyle.position === 'bottom' ? '5%' : 0,
            zIndex: 1000,
          }}>
          <div style={{
            fontFamily: fontFamily,
            fontSize: subtitleStyle.fontSize || 48,
            color: subtitleStyle.color || '#FFFFFF',
            textAlign: 'center',
              maxWidth: '80%',
              backgroundColor: `rgba(0,0,0,${subtitleStyle.backgroundOpacity || 0.7})`,
              padding: '12px 24px',
              borderRadius: '8px',
              ...(subtitleStyle.outlineStyle === 'stroke' ? {
                WebkitTextStroke: `${subtitleStyle.outlineWidth || 2}px ${subtitleStyle.outlineColor || '#000000'}`,
              } : {}),
              ...(subtitleStyle.outlineStyle === 'glow' ? {
                textShadow: `0 0 ${(subtitleStyle.outlineWidth || 2) * 2}px ${subtitleStyle.outlineColor || '#000000'}`,
              } : {}),
              ...(subtitleStyle.outlineStyle === 'shadow' ? {
                textShadow: `${subtitleStyle.outlineWidth || 2}px ${subtitleStyle.outlineWidth || 2}px ${(subtitleStyle.outlineWidth || 2) * 2}px ${subtitleStyle.outlineColor || '#000000'}`,
              } : {}),
            }}>
            {(() => {
                const words = currentSubtitleSegment.words;
                const segmentText = currentSubtitleSegment.text;
                
                // If words array is missing/empty, show text directly as fallback
                if (!words || words.length === 0) {
                  return segmentText ? <span>{segmentText}</span> : null;
                }
                
                const wordsPerLine = Math.ceil(words.length / 3);
                const lines = [
                  words.slice(0, wordsPerLine),
                  words.slice(wordsPerLine, wordsPerLine * 2),
                  words.slice(wordsPerLine * 2),
                ].filter(line => line.length > 0);

                return lines.map((lineWords, lineIndex) => (
                  <div key={lineIndex} style={{ display: 'block', marginBottom: lineIndex < lines.length - 1 ? '0.2em' : '0' }}>
                    {lineWords.map((word, wordIndex) => (
                      <span
                        key={wordIndex}
                        style={{
                          fontWeight: currentWord?.text === word.text ? 'bold' : 'normal',
                          marginRight: '0.3em',
                        }}
                      >
                        {word.text}
                      </span>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }

  // Fallback to single background rendering
  return (
    <AbsoluteFill>
      <BackgroundLayer background={background} />
      
      {voiceoverUrl && (
        <Audio 
          src={voiceoverUrl} 
          startFrom={0} 
          volume={1.0} 
          loop={false} 
        />
      )}
      {backgroundMusicUrl && (
        <Audio 
          src={backgroundMusicUrl} 
          startFrom={0} 
          volume={backgroundMusicVolume} 
          loop={false} 
        />
      )}
      
      {/* INLINE SUBTITLE RENDERING - no child component with hooks */}
      {currentSubtitleSegment && subtitleStyle && (
        <AbsoluteFill style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: subtitleStyle.position === 'top' ? 'flex-start' : subtitleStyle.position === 'center' ? 'center' : 'flex-end',
          paddingTop: subtitleStyle.position === 'top' ? '5%' : 0,
          paddingBottom: subtitleStyle.position === 'bottom' ? '5%' : 0,
          zIndex: 1000,
        }}>
          <div style={{
            fontFamily: fontFamily,
            fontSize: subtitleStyle.fontSize || 48,
            color: subtitleStyle.color || '#FFFFFF',
            textAlign: 'center',
            maxWidth: '80%',
            backgroundColor: `rgba(0,0,0,${subtitleStyle.backgroundOpacity || 0.7})`,
            padding: '12px 24px',
            borderRadius: '8px',
            ...(subtitleStyle.outlineStyle === 'stroke' ? {
              WebkitTextStroke: `${subtitleStyle.outlineWidth || 2}px ${subtitleStyle.outlineColor || '#000000'}`,
            } : {}),
            ...(subtitleStyle.outlineStyle === 'glow' ? {
              textShadow: `0 0 ${(subtitleStyle.outlineWidth || 2) * 2}px ${subtitleStyle.outlineColor || '#000000'}`,
            } : {}),
            ...(subtitleStyle.outlineStyle === 'shadow' ? {
              textShadow: `${subtitleStyle.outlineWidth || 2}px ${subtitleStyle.outlineWidth || 2}px ${(subtitleStyle.outlineWidth || 2) * 2}px ${subtitleStyle.outlineColor || '#000000'}`,
            } : {}),
          }}>
            {(() => {
              const words = currentSubtitleSegment.words;
              const segmentText = currentSubtitleSegment.text;
              
              // If words array is missing/empty, show text directly as fallback
              if (!words || words.length === 0) {
                return segmentText ? <span>{segmentText}</span> : null;
              }
              
              const wordsPerLine = Math.ceil(words.length / 3);
              const lines = [
                words.slice(0, wordsPerLine),
                words.slice(wordsPerLine, wordsPerLine * 2),
                words.slice(wordsPerLine * 2),
              ].filter(line => line.length > 0);

              return lines.map((lineWords, lineIndex) => (
                <div key={lineIndex} style={{ display: 'block', marginBottom: lineIndex < lines.length - 1 ? '0.2em' : '0' }}>
                  {lineWords.map((word, wordIndex) => (
                    <span
                      key={wordIndex}
                      style={{
                        fontWeight: currentWord?.text === word.text ? 'bold' : 'normal',
                        marginRight: '0.3em',
                      }}
                    >
                      {word.text}
                    </span>
                  ))}
                </div>
              ));
            })()}
          </div>
        </AbsoluteFill>
      )}
      
    </AbsoluteFill>
  );
};
