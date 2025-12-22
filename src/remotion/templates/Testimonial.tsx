import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';
import { Background } from '../components/Background';
import { safeInterpolate } from '../utils/safeInterpolate';

export const TestimonialSchema = z.object({
  customerName: z.string(),
  testimonialText: z.string(),
  rating: z.number().min(1).max(5),
  customerPhoto: z.string().optional(),
});

type TestimonialProps = z.infer<typeof TestimonialSchema>;

export const Testimonial: React.FC<TestimonialProps> = ({
  customerName,
  testimonialText,
  rating,
  customerPhoto,
}) => {
  const frame = useCurrentFrame();

  const photoOpacity = safeInterpolate(frame, [10, 25], [0, 1]);
  const photoScale = safeInterpolate(frame, [10, 25], [0.8, 1]);
  const textOpacity = safeInterpolate(frame, [30, 45], [0, 1]);
  const starsOpacity = safeInterpolate(frame, [50, 65], [0, 1]);

  return (
    <AbsoluteFill>
      <Background type="gradient" colors={['#667eea', '#764ba2']} />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px',
        }}
      >
        {/* Customer Photo */}
        {customerPhoto && (
          <div
            style={{
              opacity: photoOpacity,
              transform: `scale(${photoScale})`,
              marginBottom: 40,
            }}
          >
            <Img
              src={customerPhoto}
              style={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '8px solid white',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        )}

        {/* Testimonial Text */}
        <AnimatedText
          text={`"${testimonialText}"`}
          opacity={textOpacity}
          style={{
            fontSize: 40,
            color: 'white',
            lineHeight: 1.6,
            fontStyle: 'italic',
            marginBottom: 30,
          }}
        />

        {/* Customer Name */}
        <AnimatedText
          text={customerName}
          opacity={textOpacity}
          delay={10}
          style={{
            fontSize: 32,
            color: 'white',
            fontWeight: 'bold',
            marginBottom: 20,
          }}
        />

        {/* Star Rating */}
        <div
          style={{
            opacity: starsOpacity,
            display: 'flex',
            gap: 10,
          }}
        >
          {Array.from({ length: rating }).map((_, i) => (
            <span
              key={i}
              style={{
                fontSize: 48,
                color: '#FFD700',
              }}
            >
              ⭐
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
