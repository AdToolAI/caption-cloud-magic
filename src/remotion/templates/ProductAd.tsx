import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';

export const ProductAdSchema = z.object({
  imageUrl: z.string(),
  productName: z.string(),
  tagline: z.string(),
  ctaText: z.string(),
});

type ProductAdProps = z.infer<typeof ProductAdSchema>;

export const ProductAd: React.FC<ProductAdProps> = ({
  imageUrl,
  productName,
  tagline,
  ctaText,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Image zoom animation
  const imageScale = interpolate(frame, [0, 30], [1.2, 1], {
    extrapolateRight: 'clamp',
  });

  // Text fade in
  const textOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // CTA fade in
  const ctaOpacity = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames - 15],
    [0, 1],
    {
      extrapolateRight: 'clamp',
    }
  );

  // CTA pulse
  const ctaScale = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 1.1],
    {
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Image */}
      <AbsoluteFill style={{ transform: `scale(${imageScale})` }}>
        <Img
          src={imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Gradient Overlay */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Product Name */}
      <AnimatedText
        text={productName}
        opacity={textOpacity}
        style={{
          position: 'absolute',
          top: '20%',
          fontSize: 80,
          fontWeight: 'bold',
          color: 'white',
        }}
      />

      {/* Tagline */}
      <AnimatedText
        text={tagline}
        opacity={textOpacity}
        delay={15}
        style={{
          position: 'absolute',
          top: '35%',
          fontSize: 40,
          color: 'white',
        }}
      />

      {/* CTA Button */}
      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          left: '50%',
          transform: `translateX(-50%) scale(${ctaScale})`,
          opacity: ctaOpacity,
          background: 'linear-gradient(135deg, #FF0050, #FF5050)',
          padding: '25px 60px',
          borderRadius: '50px',
          boxShadow: '0 10px 30px rgba(255, 0, 80, 0.4)',
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 'bold',
            color: 'white',
          }}
        >
          {ctaText}
        </span>
      </div>
    </AbsoluteFill>
  );
};
