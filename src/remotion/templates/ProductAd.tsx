import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';
import { safeInterpolate, safeDuration } from '../utils/safeInterpolate';

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
  const imageScale = safeInterpolate(frame, [0, 30], [1.2, 1]);

  // Text fade in
  const textOpacity = safeInterpolate(frame, [15, 30], [0, 1]);

  // ✅ Validate durationInFrames - Minimum 60 Frames
  const safeDur = safeDuration(durationInFrames, 60);
  const ctaStart = Math.max(0, safeDur - 30);
  const ctaMid = Math.max(ctaStart + 1, safeDur - 15);

  // CTA fade in
  const ctaOpacity = safeInterpolate(
    frame,
    [ctaStart, ctaMid],
    [0, 1]
  );

  // CTA pulse
  const ctaScale = safeInterpolate(
    frame,
    [ctaMid, safeDur],
    [1, 1.1]
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
