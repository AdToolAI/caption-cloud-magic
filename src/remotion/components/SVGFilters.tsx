import React from 'react';

/**
 * SVG Filter Definitions for transformative visual effects
 * These filters provide REAL effects like edge detection, scanlines, glow, etc.
 */
export const SVGFilters: React.FC = () => {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {/* ============================================ */}
        {/* CARTOON FILTER - Edge Detection + Posterize */}
        {/* ============================================ */}
        <filter id="cartoon-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Edge Detection using Sobel-like kernel */}
          <feConvolveMatrix
            in="SourceGraphic"
            order="3"
            kernelMatrix="-1 -1 -1  -1 8 -1  -1 -1 -1"
            divisor="1"
            bias="0"
            preserveAlpha="true"
            result="edges"
          />
          
          {/* Step 2: Posterize colors to 5 levels for cel-shading */}
          <feComponentTransfer in="SourceGraphic" result="posterized">
            <feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
            <feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
            <feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
          </feComponentTransfer>
          
          {/* Step 3: Increase saturation of posterized image */}
          <feColorMatrix
            in="posterized"
            type="saturate"
            values="1.8"
            result="saturatedPoster"
          />
          
          {/* Step 4: Invert and threshold edges for dark outlines */}
          <feColorMatrix
            in="edges"
            type="matrix"
            values="-1 0 0 0 1
                    0 -1 0 0 1
                    0 0 -1 0 1
                    0 0 0 1 0"
            result="invertedEdges"
          />
          
          {/* Step 5: Make edges darker */}
          <feComponentTransfer in="invertedEdges" result="darkEdges">
            <feFuncR type="linear" slope="2" intercept="-0.5" />
            <feFuncG type="linear" slope="2" intercept="-0.5" />
            <feFuncB type="linear" slope="2" intercept="-0.5" />
          </feComponentTransfer>
          
          {/* Step 6: Combine posterized colors with edge outlines */}
          <feBlend in="saturatedPoster" in2="darkEdges" mode="multiply" result="cartoonBase" />
          
          {/* Step 7: Boost contrast slightly */}
          <feComponentTransfer in="cartoonBase">
            <feFuncR type="linear" slope="1.2" intercept="-0.1" />
            <feFuncG type="linear" slope="1.2" intercept="-0.1" />
            <feFuncB type="linear" slope="1.2" intercept="-0.1" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* ANIME FILTER - Soft edges + Glow + Vibrant */}
        {/* ============================================ */}
        <filter id="anime-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Slight blur for softer look */}
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="softened" />
          
          {/* Step 2: Posterize to fewer colors */}
          <feComponentTransfer in="softened" result="posterized">
            <feFuncR type="discrete" tableValues="0 0.15 0.35 0.55 0.75 0.9 1" />
            <feFuncG type="discrete" tableValues="0 0.15 0.35 0.55 0.75 0.9 1" />
            <feFuncB type="discrete" tableValues="0 0.15 0.35 0.55 0.75 0.9 1" />
          </feComponentTransfer>
          
          {/* Step 3: Increase saturation for anime colors */}
          <feColorMatrix
            in="posterized"
            type="saturate"
            values="1.6"
            result="vibrant"
          />
          
          {/* Step 4: Extract highlights for glow */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0 0 0 1 0"
            result="grayscale"
          />
          <feComponentTransfer in="grayscale" result="highlights">
            <feFuncR type="linear" slope="3" intercept="-1.5" />
            <feFuncG type="linear" slope="3" intercept="-1.5" />
            <feFuncB type="linear" slope="3" intercept="-1.5" />
          </feComponentTransfer>
          
          {/* Step 5: Blur highlights for glow effect */}
          <feGaussianBlur in="highlights" stdDeviation="4" result="glow" />
          
          {/* Step 6: Combine with screen blend */}
          <feBlend in="vibrant" in2="glow" mode="screen" result="withGlow" />
          
          {/* Step 7: Slight brightness boost */}
          <feComponentTransfer in="withGlow">
            <feFuncR type="linear" slope="1.1" intercept="0.05" />
            <feFuncG type="linear" slope="1.1" intercept="0.05" />
            <feFuncB type="linear" slope="1.1" intercept="0.05" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* VHS FILTER - Scanlines + Chromatic Aberration */}
        {/* ============================================ */}
        <filter id="vhs-filter" colorInterpolationFilters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
          {/* Step 1: Split RGB channels for chromatic aberration */}
          <feOffset in="SourceGraphic" dx="3" dy="0" result="redShift" />
          <feOffset in="SourceGraphic" dx="-3" dy="0" result="blueShift" />
          
          {/* Extract red from shifted */}
          <feColorMatrix
            in="redShift"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="red"
          />
          
          {/* Extract green from original */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="green"
          />
          
          {/* Extract blue from shifted */}
          <feColorMatrix
            in="blueShift"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="blue"
          />
          
          {/* Combine RGB */}
          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="aberration" />
          
          {/* Step 2: Add noise/grain */}
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="42" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0.15 0 0 0 0
                    0 0.15 0 0 0
                    0 0 0.15 0 0
                    0 0 0 0.1 0"
            result="reducedNoise"
          />
          <feBlend in="aberration" in2="reducedNoise" mode="overlay" result="withNoise" />
          
          {/* Step 3: VHS color degradation */}
          <feColorMatrix
            in="withNoise"
            type="matrix"
            values="1.1 0.1 0 0 -0.05
                    0 1 0.1 0 0
                    0 0.1 0.9 0 0.05
                    0 0 0 1 0"
            result="vhsColors"
          />
          
          {/* Step 4: Reduce contrast slightly and add warmth */}
          <feComponentTransfer in="vhsColors">
            <feFuncR type="linear" slope="0.9" intercept="0.08" />
            <feFuncG type="linear" slope="0.85" intercept="0.05" />
            <feFuncB type="linear" slope="0.8" intercept="0.03" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* CYBERPUNK FILTER - Neon Glow + High Contrast */}
        {/* ============================================ */}
        <filter id="cyberpunk-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Boost contrast dramatically */}
          <feComponentTransfer in="SourceGraphic" result="highContrast">
            <feFuncR type="linear" slope="1.5" intercept="-0.25" />
            <feFuncG type="linear" slope="1.5" intercept="-0.25" />
            <feFuncB type="linear" slope="1.5" intercept="-0.25" />
          </feComponentTransfer>
          
          {/* Step 2: Shift toward cyan/magenta palette */}
          <feColorMatrix
            in="highContrast"
            type="matrix"
            values="0.8 0.1 0.3 0 0
                    0.2 0.6 0.3 0 0.1
                    0.3 0.2 1.2 0 0.1
                    0 0 0 1 0"
            result="neonColors"
          />
          
          {/* Step 3: Extract bright areas for glow */}
          <feComponentTransfer in="neonColors" result="brightAreas">
            <feFuncR type="linear" slope="2" intercept="-0.8" />
            <feFuncG type="linear" slope="2" intercept="-0.8" />
            <feFuncB type="linear" slope="2" intercept="-0.8" />
          </feComponentTransfer>
          
          {/* Step 4: Blur for neon glow */}
          <feGaussianBlur in="brightAreas" stdDeviation="6" result="glow" />
          
          {/* Step 5: Color the glow pink/cyan */}
          <feColorMatrix
            in="glow"
            type="matrix"
            values="1.5 0 0.5 0 0
                    0 0.5 1 0 0
                    0.5 0.5 1.5 0 0
                    0 0 0 1 0"
            result="coloredGlow"
          />
          
          {/* Step 6: Combine with additive blend */}
          <feBlend in="neonColors" in2="coloredGlow" mode="screen" result="withGlow" />
          
          {/* Step 7: Final saturation boost */}
          <feColorMatrix
            in="withGlow"
            type="saturate"
            values="1.4"
          />
        </filter>

        {/* ============================================ */}
        {/* HORROR FILTER - Desaturate + Red Accent + Grain */}
        {/* ============================================ */}
        <filter id="horror-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Heavy desaturation with red preservation */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0.5 0.3 0.2 0 0
                    0.15 0.4 0.15 0 0
                    0.1 0.2 0.3 0 0
                    0 0 0 1 0"
            result="desaturated"
          />
          
          {/* Step 2: Increase contrast dramatically */}
          <feComponentTransfer in="desaturated" result="highContrast">
            <feFuncR type="linear" slope="1.6" intercept="-0.3" />
            <feFuncG type="linear" slope="1.4" intercept="-0.25" />
            <feFuncB type="linear" slope="1.3" intercept="-0.2" />
          </feComponentTransfer>
          
          {/* Step 3: Darken overall */}
          <feComponentTransfer in="highContrast" result="darkened">
            <feFuncR type="linear" slope="0.7" intercept="0" />
            <feFuncG type="linear" slope="0.6" intercept="0" />
            <feFuncB type="linear" slope="0.5" intercept="0" />
          </feComponentTransfer>
          
          {/* Step 4: Add greenish/sickly tint */}
          <feColorMatrix
            in="darkened"
            type="matrix"
            values="1 0 0 0 0
                    0.1 1.1 0 0 0.02
                    0 0.1 0.9 0 0
                    0 0 0 1 0"
            result="tinted"
          />
          
          {/* Step 5: Add film grain */}
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="666" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0.1 0 0 0 0
                    0 0.1 0 0 0
                    0 0 0.1 0 0
                    0 0 0 0.08 0"
            result="reducedGrain"
          />
          <feBlend in="tinted" in2="reducedGrain" mode="overlay" />
        </filter>

        {/* ============================================ */}
        {/* POP ART FILTER - Posterize + High Saturation */}
        {/* ============================================ */}
        <filter id="pop-art-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Extreme posterization to 4 levels */}
          <feComponentTransfer in="SourceGraphic" result="posterized">
            <feFuncR type="discrete" tableValues="0 0.33 0.66 1" />
            <feFuncG type="discrete" tableValues="0 0.33 0.66 1" />
            <feFuncB type="discrete" tableValues="0 0.33 0.66 1" />
          </feComponentTransfer>
          
          {/* Step 2: Extreme saturation */}
          <feColorMatrix
            in="posterized"
            type="saturate"
            values="2.5"
            result="saturated"
          />
          
          {/* Step 3: Boost contrast */}
          <feComponentTransfer in="saturated" result="contrasted">
            <feFuncR type="linear" slope="1.4" intercept="-0.2" />
            <feFuncG type="linear" slope="1.4" intercept="-0.2" />
            <feFuncB type="linear" slope="1.4" intercept="-0.2" />
          </feComponentTransfer>
          
          {/* Step 4: Add halftone-like dot pattern */}
          <feComponentTransfer in="contrasted">
            <feFuncR type="linear" slope="1.2" intercept="0" />
            <feFuncG type="linear" slope="1.2" intercept="0" />
            <feFuncB type="linear" slope="1.2" intercept="0" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* INFRARED FILTER - False color thermal look */}
        {/* ============================================ */}
        <filter id="infrared-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Convert to grayscale based on luminance */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0.3 0.6 0.1 0 0
                    0.3 0.6 0.1 0 0
                    0.3 0.6 0.1 0 0
                    0 0 0 1 0"
            result="gray"
          />
          
          {/* Step 2: Invert and shift colors for infrared look */}
          <feColorMatrix
            in="gray"
            type="matrix"
            values="-1 0 0 0 1
                    0 0.2 0 0 0.3
                    0 0 -0.5 0 0.8
                    0 0 0 1 0"
            result="inverted"
          />
          
          {/* Step 3: Add warm/cool gradient based on brightness */}
          <feComponentTransfer in="inverted" result="thermal">
            <feFuncR type="table" tableValues="0 0.2 0.5 0.8 1 1" />
            <feFuncG type="table" tableValues="0 0.1 0.2 0.3 0.5 0.2" />
            <feFuncB type="table" tableValues="0.5 0.3 0.2 0.1 0 0" />
          </feComponentTransfer>
          
          {/* Step 4: Boost saturation */}
          <feColorMatrix
            in="thermal"
            type="saturate"
            values="1.5"
          />
        </filter>

        {/* ============================================ */}
        {/* NEON FILTER - Glow + Edge Emphasis */}
        {/* ============================================ */}
        <filter id="neon-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Boost saturation heavily */}
          <feColorMatrix
            in="SourceGraphic"
            type="saturate"
            values="2.2"
            result="saturated"
          />
          
          {/* Step 2: Shift colors toward neon palette */}
          <feColorMatrix
            in="saturated"
            type="matrix"
            values="1.2 0 0.2 0 0
                    0 1 0.3 0 0
                    0.2 0.3 1.3 0 0
                    0 0 0 1 0"
            result="neonColors"
          />
          
          {/* Step 3: Extract edges */}
          <feConvolveMatrix
            in="neonColors"
            order="3"
            kernelMatrix="-1 -1 -1  -1 9 -1  -1 -1 -1"
            result="edges"
          />
          
          {/* Step 4: Blur edges for glow */}
          <feGaussianBlur in="edges" stdDeviation="3" result="edgeGlow" />
          
          {/* Step 5: Combine with screen blend */}
          <feBlend in="neonColors" in2="edgeGlow" mode="screen" result="withGlow" />
          
          {/* Step 6: Final brightness boost */}
          <feComponentTransfer in="withGlow">
            <feFuncR type="linear" slope="1.15" intercept="0.05" />
            <feFuncG type="linear" slope="1.15" intercept="0.05" />
            <feFuncB type="linear" slope="1.15" intercept="0.05" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* DREAMY FILTER - Soft Glow + Low Contrast */}
        {/* ============================================ */}
        <filter id="dreamy-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Blur for softness */}
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurred" />
          
          {/* Step 2: Lower contrast, raise brightness */}
          <feComponentTransfer in="blurred" result="softened">
            <feFuncR type="linear" slope="0.7" intercept="0.2" />
            <feFuncG type="linear" slope="0.7" intercept="0.2" />
            <feFuncB type="linear" slope="0.7" intercept="0.2" />
          </feComponentTransfer>
          
          {/* Step 3: Desaturate slightly */}
          <feColorMatrix
            in="softened"
            type="saturate"
            values="0.75"
            result="desaturated"
          />
          
          {/* Step 4: Extract highlights for glow */}
          <feComponentTransfer in="SourceGraphic" result="highlights">
            <feFuncR type="linear" slope="2" intercept="-0.8" />
            <feFuncG type="linear" slope="2" intercept="-0.8" />
            <feFuncB type="linear" slope="2" intercept="-0.8" />
          </feComponentTransfer>
          
          {/* Step 5: Heavy blur on highlights */}
          <feGaussianBlur in="highlights" stdDeviation="15" result="highlightGlow" />
          
          {/* Step 6: Screen blend for dreamy glow */}
          <feBlend in="desaturated" in2="highlightGlow" mode="screen" />
        </filter>

        {/* ============================================ */}
        {/* FILM GRAIN FILTER - Authentic grain + Color shift */}
        {/* ============================================ */}
        <filter id="film-grain-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Slight color shift for film look */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1.05 0.05 0 0 0
                    0 1 0.05 0 0
                    0 0.05 0.95 0 0.02
                    0 0 0 1 0"
            result="filmColors"
          />
          
          {/* Step 2: Generate grain */}
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="123" result="grain" />
          
          {/* Step 3: Reduce grain intensity */}
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0.12 0 0 0 0
                    0 0.12 0 0 0
                    0 0 0.12 0 0
                    0 0 0 0.12 0"
            result="reducedGrain"
          />
          
          {/* Step 4: Blend grain with overlay */}
          <feBlend in="filmColors" in2="reducedGrain" mode="overlay" result="withGrain" />
          
          {/* Step 5: Slight contrast adjustment */}
          <feComponentTransfer in="withGrain">
            <feFuncR type="linear" slope="1.1" intercept="-0.03" />
            <feFuncG type="linear" slope="1.1" intercept="-0.03" />
            <feFuncB type="linear" slope="1.1" intercept="-0.03" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* BLEACH BYPASS FILTER - Desaturated + High Contrast */}
        {/* ============================================ */}
        <filter id="bleach-bypass-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Heavy desaturation */}
          <feColorMatrix
            in="SourceGraphic"
            type="saturate"
            values="0.4"
            result="desaturated"
          />
          
          {/* Step 2: High contrast */}
          <feComponentTransfer in="desaturated" result="highContrast">
            <feFuncR type="linear" slope="1.5" intercept="-0.25" />
            <feFuncG type="linear" slope="1.5" intercept="-0.25" />
            <feFuncB type="linear" slope="1.5" intercept="-0.25" />
          </feComponentTransfer>
          
          {/* Step 3: Slight brightness boost */}
          <feComponentTransfer in="highContrast">
            <feFuncR type="linear" slope="1" intercept="0.1" />
            <feFuncG type="linear" slope="1" intercept="0.1" />
            <feFuncB type="linear" slope="1" intercept="0.1" />
          </feComponentTransfer>
        </filter>

        {/* ============================================ */}
        {/* CROSS PROCESS FILTER - Color channel swap */}
        {/* ============================================ */}
        <filter id="cross-process-filter" colorInterpolationFilters="sRGB">
          {/* Step 1: Swap/shift color channels */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1.2 0.1 -0.1 0 0
                    -0.1 1 0.2 0 0.05
                    0.1 -0.1 1.1 0 0.1
                    0 0 0 1 0"
            result="shifted"
          />
          
          {/* Step 2: Boost saturation */}
          <feColorMatrix
            in="shifted"
            type="saturate"
            values="1.4"
            result="saturated"
          />
          
          {/* Step 3: Add contrast */}
          <feComponentTransfer in="saturated">
            <feFuncR type="linear" slope="1.2" intercept="-0.1" />
            <feFuncG type="linear" slope="1.2" intercept="-0.1" />
            <feFuncB type="linear" slope="1.2" intercept="-0.1" />
          </feComponentTransfer>
        </filter>

      </defs>
    </svg>
  );
};

// VHS Scanlines Overlay Component (CSS-based for performance)
export const VHSScanlines: React.FC<{ intensity?: number }> = ({ intensity = 0.3 }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        background: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, ${intensity}) 2px,
          rgba(0, 0, 0, ${intensity}) 4px
        )`,
        zIndex: 100,
      }}
    />
  );
};

// Vignette Overlay Component
export const VignetteOverlay: React.FC<{ intensity?: number; color?: string }> = ({ 
  intensity = 0.5, 
  color = '0, 0, 0' 
}) => {
  const size = Math.max(30, 70 - intensity * 40);
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        background: `radial-gradient(circle, transparent ${size}%, rgba(${color}, ${intensity}) 100%)`,
        zIndex: 100,
      }}
    />
  );
};

// Filter ID to SVG filter URL mapping
export const SVG_FILTER_IDS: Record<string, string> = {
  cartoon: 'url(#cartoon-filter)',
  anime: 'url(#anime-filter)',
  retro_vhs: 'url(#vhs-filter)',
  cyberpunk: 'url(#cyberpunk-filter)',
  horror: 'url(#horror-filter)',
  pop_art: 'url(#pop-art-filter)',
  infrared: 'url(#infrared-filter)',
  neon: 'url(#neon-filter)',
  dreamy: 'url(#dreamy-filter)',
  film_grain: 'url(#film-grain-filter)',
  bleach_bypass: 'url(#bleach-bypass-filter)',
  cross_process: 'url(#cross-process-filter)',
};

// Check if a filter uses SVG
export const isSVGFilter = (filterId: string): boolean => {
  return filterId in SVG_FILTER_IDS;
};

export default SVGFilters;
