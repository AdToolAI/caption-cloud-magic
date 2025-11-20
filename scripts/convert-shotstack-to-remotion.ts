/**
 * Shotstack to Remotion Template Converter
 * 
 * This script converts Shotstack JSON configurations to Remotion React components.
 * Run with: npx tsx scripts/convert-shotstack-to-remotion.ts
 */

interface ShotstackClip {
  asset: {
    type: 'image' | 'video' | 'title' | 'audio';
    src?: string;
    text?: string;
    style?: string;
  };
  start: number;
  length: number;
  transition?: {
    in?: string;
    out?: string;
  };
}

interface ShotstackTrack {
  clips: ShotstackClip[];
}

interface ShotstackConfig {
  timeline: {
    tracks: ShotstackTrack[];
  };
  output: {
    format: string;
    resolution: string;
  };
}

/**
 * Convert Shotstack JSON to Remotion TypeScript component
 */
export function convertShotstackToRemotion(
  shotstackConfig: ShotstackConfig,
  componentName: string
): string {
  const tracks = shotstackConfig.timeline.tracks;
  
  // Extract customizable props from placeholders
  const props: Record<string, string> = {};
  const propsInterface: string[] = [];
  
  tracks.forEach(track => {
    track.clips.forEach(clip => {
      if (clip.asset.src && clip.asset.src.includes('{{')) {
        const match = clip.asset.src.match(/\{\{(.+?)\}\}/);
        if (match) {
          const propName = match[1];
          props[propName] = 'string';
          propsInterface.push(`  ${propName}: string;`);
        }
      }
      if (clip.asset.text && clip.asset.text.includes('{{')) {
        const match = clip.asset.text.match(/\{\{(.+?)\}\}/);
        if (match) {
          const propName = match[1];
          props[propName] = 'string';
          propsInterface.push(`  ${propName}: string;`);
        }
      }
    });
  });

  // Generate component code
  const componentCode = `import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';
import { Background } from '../components/Background';

export const ${componentName}Schema = z.object({
${propsInterface.map(line => line.replace(':', ': z.string()')).join(',\n')}
});

type ${componentName}Props = z.infer<typeof ${componentName}Schema>;

export const ${componentName}: React.FC<${componentName}Props> = ({
  ${Object.keys(props).join(',\n  ')}
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // TODO: Add animations based on Shotstack transitions
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* TODO: Convert Shotstack clips to Remotion components */}
      ${generateClipsCode(tracks)}
    </AbsoluteFill>
  );
};
`;

  return componentCode;
}

function generateClipsCode(tracks: ShotstackTrack[]): string {
  let code = '';
  
  tracks.forEach((track, trackIndex) => {
    track.clips.forEach((clip, clipIndex) => {
      if (clip.asset.type === 'image' && clip.asset.src) {
        const propName = clip.asset.src.match(/\{\{(.+?)\}\}/)?.[1] || 'imageUrl';
        code += `
      {/* Image Clip ${clipIndex} */}
      <AbsoluteFill>
        <Img src={${propName}} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
`;
      } else if (clip.asset.type === 'title' && clip.asset.text) {
        const propName = clip.asset.text.match(/\{\{(.+?)\}\}/)?.[1] || 'text';
        code += `
      {/* Text Clip ${clipIndex} */}
      <AnimatedText
        text={${propName}}
        opacity={opacity}
        style={{
          position: 'absolute',
          top: '50%',
          fontSize: 48,
          color: 'white',
        }}
      />
`;
      }
    });
  });

  return code;
}

// Example usage:
if (import.meta.main) {
  const exampleConfig: ShotstackConfig = {
    timeline: {
      tracks: [
        {
          clips: [
            {
              asset: { type: 'image', src: '{{PRODUCT_IMAGE}}' },
              start: 0,
              length: 5,
            },
            {
              asset: { type: 'title', text: '{{PRODUCT_NAME}}', style: 'bold' },
              start: 1,
              length: 4,
            },
          ],
        },
      ],
    },
    output: {
      format: 'mp4',
      resolution: '1080x1920',
    },
  };

  const remotionCode = convertShotstackToRemotion(exampleConfig, 'ProductShowcase');
  console.log(remotionCode);
}
