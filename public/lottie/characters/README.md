# Professional Lottie Character Library

This directory contains local Lottie JSON files for the Explainer Video Studio character animations.

## Expected Files

For 95%+ Loft-Film quality, add the following Lottie JSON files:

- `presenter-idle.json` - Breathing, blinking, subtle movement
- `presenter-waving.json` - Waving gesture for hook scenes
- `presenter-thinking.json` - Thoughtful pose for problem scenes
- `presenter-celebrating.json` - Celebratory pose for solution scenes
- `presenter-explaining.json` - Explaining gesture for feature scenes
- `presenter-pointing.json` - Pointing gesture for CTA scenes
- `presenter-talking.json` - Talking animation with lip-sync base

## Recommended Sources

1. **LottieFiles Premium** (~$15/month) - Best quality, commercial license
2. **IconScout** (~$20/month) - Good business characters
3. **Storyset** (Free) - Attribution required
4. **Custom Production** - After Effects + Bodymovin export

## File Requirements

- Format: JSON (Lottie format)
- Size: < 500KB per file
- Frame rate: 30fps recommended
- Duration: 90 frames (3 seconds) minimum
- Loop: Yes

## Fallback System

The ProfessionalLottieCharacter component uses a 4-tier fallback system:

1. **Local files** (this directory) - Most reliable
2. **CDN URLs** - LottieFiles CDN
3. **Inline Lottie** - Embedded JSON data
4. **SVG Fallback** - Ultimate fallback with CSS animations

## Brand Color Integration

For brand color support, Lottie files should use placeholder colors:
- `#F5C76A` for primary brand color (will be replaced)
- `#8B5CF6` for secondary brand color (will be replaced)
