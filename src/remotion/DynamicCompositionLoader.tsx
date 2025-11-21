import React from 'react';
import { ProductAd } from './templates/ProductAd';
import { InstagramStory } from './templates/InstagramStory';
import { TikTokReel } from './templates/TikTokReel';
import { Testimonial } from './templates/Testimonial';
import { Tutorial } from './templates/Tutorial';
import { UniversalVideo } from './templates/UniversalVideo';

// Component Registry
const COMPONENT_REGISTRY = {
  ProductAd,
  InstagramStory,
  TikTokReel,
  Testimonial,
  Tutorial,
  UniversalVideo,
} as const;

export type RemotionComponentId = keyof typeof COMPONENT_REGISTRY;

interface DynamicCompositionLoaderProps {
  componentId: RemotionComponentId;
  inputProps: Record<string, any>;
}

/**
 * Dynamically loads and renders a Remotion component based on componentId
 * Maps customization fields to the correct Remotion props
 */
export const DynamicCompositionLoader: React.FC<DynamicCompositionLoaderProps> = ({
  componentId,
  inputProps,
}) => {
  const Component = COMPONENT_REGISTRY[componentId];

  if (!Component) {
    console.error(`Unknown Remotion component: ${componentId}`);
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: '#ff4444',
        fontSize: 24,
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        padding: 40
      }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
          <div>Component nicht gefunden: {componentId}</div>
          <div style={{ fontSize: 14, marginTop: 10, opacity: 0.7 }}>
            Verfügbare Components: {Object.keys(COMPONENT_REGISTRY).join(', ')}
          </div>
        </div>
      </div>
    );
  }

  return <Component {...inputProps} />;
};

/**
 * Maps template customization fields to Remotion component props
 * Applies transformations if needed
 */
export const mapFieldsToProps = (
  customizations: Record<string, any>,
  fieldMappings: Array<{
    field_key: string;
    remotion_prop_name: string;
    transformation_function?: string | null;
  }>
): Record<string, any> => {
  const mappedProps: Record<string, any> = {};

  fieldMappings.forEach(mapping => {
    const value = customizations[mapping.field_key];
    
    if (value !== undefined) {
      let transformedValue = value;

      // Apply transformation if specified
      if (mapping.transformation_function) {
        transformedValue = applyTransformation(value, mapping.transformation_function);
      }

      mappedProps[mapping.remotion_prop_name] = transformedValue;
    }
  });

  // Pass through any unmapped fields (for backward compatibility)
  Object.keys(customizations).forEach(key => {
    if (!(key in mappedProps)) {
      mappedProps[key] = customizations[key];
    }
  });

  return mappedProps;
};

/**
 * Applies transformation functions to field values
 */
const applyTransformation = (value: any, transformationName: string): any => {
  switch (transformationName) {
    case 'color_to_hex':
      // Ensure color is in hex format
      if (typeof value === 'string' && value.startsWith('#')) {
        return value;
      }
      return `#${value}`;

    case 'to_number':
      return Number(value);

    case 'to_string':
      return String(value);

    case 'to_array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value.split(',').map(s => s.trim());
      }
      return [value];

    case 'url_encode':
      return encodeURIComponent(value);

    default:
      console.warn(`Unknown transformation function: ${transformationName}`);
      return value;
  }
};

/**
 * Gets default composition settings for a component
 */
export const getCompositionSettings = (componentId: RemotionComponentId) => {
  const settings: Record<RemotionComponentId, {
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
  }> = {
    ProductAd: {
      durationInFrames: 450,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    InstagramStory: {
      durationInFrames: 300,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    TikTokReel: {
      durationInFrames: 900,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    Testimonial: {
      durationInFrames: 600,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    Tutorial: {
      durationInFrames: 1200,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    UniversalVideo: {
      durationInFrames: 900,
      fps: 30,
      width: 1080,
      height: 1920,
    },
  };

  return settings[componentId] || settings.UniversalVideo;
};
