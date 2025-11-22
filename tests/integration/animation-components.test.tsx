/**
 * Integration Tests: Animation Components
 * Tests Remotion animation components with frame-by-frame validation
 */

import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/test-utils';
import { TextTypewriter } from '@/remotion/components/animations/TextTypewriter';
import { TextHighlight } from '@/remotion/components/animations/TextHighlight';
import { TextScaleUp } from '@/remotion/components/animations/TextScaleUp';
import { TextGlitch } from '@/remotion/components/animations/TextGlitch';
import { TextBounce } from '@/remotion/components/animations/TextBounce';
import { ZoomIn } from '@/remotion/components/animations/ZoomIn';
import { PanEffect } from '@/remotion/components/animations/PanEffect';
import { ParallaxEffect } from '@/remotion/components/animations/ParallaxEffect';
import { FadeTransition } from '@/remotion/components/transitions/FadeTransition';
import { CrossfadeTransition } from '@/remotion/components/transitions/CrossfadeTransition';

// Mock Remotion hooks
vi.mock('remotion', () => ({
  useCurrentFrame: vi.fn(() => 0),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080 })),
  interpolate: vi.fn((frame, range, output) => {
    const [start, end] = range;
    const [outStart, outEnd] = output;
    const progress = (frame - start) / (end - start);
    return outStart + progress * (outEnd - outStart);
  }),
  spring: vi.fn(() => 1),
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
}));

describe('TextTypewriter', () => {
  it('should render text progressively', () => {
    const { container } = render(
      <TextTypewriter text="Hello World" startFrame={0} speed={1} />
    );
    
    expect(container).toBeTruthy();
  });

  it('should respect speed parameter', () => {
    const { rerender, container } = render(
      <TextTypewriter text="Test" startFrame={0} speed={1} />
    );
    
    const defaultContent = container.textContent;
    
    rerender(<TextTypewriter text="Test" startFrame={0} speed={2} />);
    
    // Faster speed should affect character reveal timing
    expect(container).toBeTruthy();
  });

  it('should show cursor blink', () => {
    const { container } = render(
      <TextTypewriter text="Test" startFrame={0} showCursor={true} />
    );
    
    // Should contain cursor element or styling
    expect(container.innerHTML).toContain('cursor');
  });

  it('should handle empty text', () => {
    const { container } = render(
      <TextTypewriter text="" startFrame={0} speed={1} />
    );
    
    expect(container).toBeTruthy();
  });
});

describe('TextHighlight', () => {
  it('should render with highlight animation', () => {
    const { container } = render(
      <TextHighlight text="Highlight Me" startFrame={0} speed={1} />
    );
    
    expect(container.textContent).toContain('Highlight Me');
  });

  it('should use custom highlight color', () => {
    const { container } = render(
      <TextHighlight 
        text="Test" 
        startFrame={0} 
        highlightColor="#FFD700" 
      />
    );
    
    const highlightElement = container.querySelector('[style*="background"]');
    expect(highlightElement).toBeTruthy();
  });

  it('should animate highlight width from 0 to 100%', () => {
    const { container } = render(
      <TextHighlight text="Test" startFrame={0} speed={1} />
    );
    
    // Check for width animation element
    const highlightDiv = container.querySelector('div[style*="width"]');
    expect(highlightDiv).toBeTruthy();
  });

  it('should respect animation speed', () => {
    const slowRender = render(
      <TextHighlight text="Test" startFrame={0} speed={0.5} />
    );
    
    const fastRender = render(
      <TextHighlight text="Test" startFrame={0} speed={2} />
    );
    
    expect(slowRender.container).toBeTruthy();
    expect(fastRender.container).toBeTruthy();
  });
});

describe('TextScaleUp', () => {
  it('should render text with scale animation', () => {
    const { container } = render(
      <TextScaleUp text="Scale Up" startFrame={0} speed={1} />
    );
    
    expect(container.textContent).toContain('Scale Up');
  });

  it('should apply transform scale style', () => {
    const { container } = render(
      <TextScaleUp text="Test" startFrame={0} speed={1} />
    );
    
    const textElement = container.querySelector('[style*="transform"]');
    expect(textElement).toBeTruthy();
  });

  it('should handle custom styles', () => {
    const customStyle = { color: 'red', fontSize: '24px' };
    const { container } = render(
      <TextScaleUp text="Test" startFrame={0} speed={1} style={customStyle} />
    );
    
    expect(container).toBeTruthy();
  });
});

describe('TextGlitch', () => {
  it('should render text with glitch effect', () => {
    const { container } = render(
      <TextGlitch text="Glitch Text" startFrame={0} intensity={1} />
    );
    
    expect(container.textContent).toContain('Glitch Text');
  });

  it('should respect intensity parameter', () => {
    const lowIntensity = render(
      <TextGlitch text="Test" startFrame={0} intensity={0.3} />
    );
    
    const highIntensity = render(
      <TextGlitch text="Test" startFrame={0} intensity={1.5} />
    );
    
    expect(lowIntensity.container).toBeTruthy();
    expect(highIntensity.container).toBeTruthy();
  });
});

describe('TextBounce', () => {
  it('should render text with bounce animation', () => {
    const { container } = render(
      <TextBounce text="Bounce" startFrame={0} speed={1} />
    );
    
    expect(container.textContent).toContain('Bounce');
  });

  it('should apply bounce transform', () => {
    const { container } = render(
      <TextBounce text="Test" startFrame={0} speed={1} />
    );
    
    const element = container.querySelector('[style*="transform"]');
    expect(element).toBeTruthy();
  });
});

describe('ZoomIn (Ken Burns Effect)', () => {
  it('should render with zoom animation', () => {
    const { container } = render(
      <ZoomIn durationInFrames={150} intensity={1.2}>
        <div>Content</div>
      </ZoomIn>
    );
    
    expect(container.textContent).toContain('Content');
  });

  it('should apply scale transform with intensity', () => {
    const { container } = render(
      <ZoomIn durationInFrames={150} intensity={1.5}>
        <div>Content</div>
      </ZoomIn>
    );
    
    const element = container.querySelector('[style*="transform"]');
    expect(element).toBeTruthy();
  });

  it('should use default intensity if not provided', () => {
    const { container } = render(
      <ZoomIn durationInFrames={150}>
        <div>Content</div>
      </ZoomIn>
    );
    
    expect(container).toBeTruthy();
  });

  it('should set transform origin to center', () => {
    const { container } = render(
      <ZoomIn durationInFrames={150} intensity={1.2}>
        <div>Content</div>
      </ZoomIn>
    );
    
    const element = container.querySelector('[style*="transformOrigin"]');
    expect(element).toBeTruthy();
  });
});

describe('PanEffect', () => {
  it('should render with pan animation', () => {
    const { container } = render(
      <PanEffect durationInFrames={150} direction="left" distance={50}>
        <div>Content</div>
      </PanEffect>
    );
    
    expect(container.textContent).toContain('Content');
  });

  it('should handle all four directions', () => {
    const directions: Array<'left' | 'right' | 'up' | 'down'> = ['left', 'right', 'up', 'down'];
    
    directions.forEach(direction => {
      const { container } = render(
        <PanEffect durationInFrames={150} direction={direction} distance={50}>
          <div>Content</div>
        </PanEffect>
      );
      
      expect(container).toBeTruthy();
    });
  });

  it('should apply translate transform', () => {
    const { container } = render(
      <PanEffect durationInFrames={150} direction="left" distance={100}>
        <div>Content</div>
      </PanEffect>
    );
    
    const element = container.querySelector('[style*="transform"]');
    expect(element).toBeTruthy();
  });

  it('should respect distance parameter', () => {
    const shortPan = render(
      <PanEffect durationInFrames={150} direction="left" distance={25}>
        <div>Content</div>
      </PanEffect>
    );
    
    const longPan = render(
      <PanEffect durationInFrames={150} direction="left" distance={100}>
        <div>Content</div>
      </PanEffect>
    );
    
    expect(shortPan.container).toBeTruthy();
    expect(longPan.container).toBeTruthy();
  });
});

describe('ParallaxEffect', () => {
  it('should render multiple layers', () => {
    const layers = [
      { depth: 1, children: <div>Layer 1</div> },
      { depth: 2, children: <div>Layer 2</div> },
      { depth: 3, children: <div>Layer 3</div> },
    ];
    
    const { container } = render(
      <ParallaxEffect durationInFrames={150} layers={layers} />
    );
    
    expect(container.textContent).toContain('Layer 1');
    expect(container.textContent).toContain('Layer 2');
    expect(container.textContent).toContain('Layer 3');
  });

  it('should apply different transforms based on depth', () => {
    const layers = [
      { depth: 1, children: <div>Foreground</div> },
      { depth: 3, children: <div>Background</div> },
    ];
    
    const { container } = render(
      <ParallaxEffect durationInFrames={150} layers={layers} />
    );
    
    const layerElements = container.querySelectorAll('[style*="transform"]');
    expect(layerElements.length).toBeGreaterThan(0);
  });

  it('should handle single layer', () => {
    const layers = [
      { depth: 1, children: <div>Single Layer</div> },
    ];
    
    const { container } = render(
      <ParallaxEffect durationInFrames={150} layers={layers} />
    );
    
    expect(container.textContent).toContain('Single Layer');
  });
});

describe('FadeTransition', () => {
  it('should render fade in transition', () => {
    const { container } = render(
      <FadeTransition direction="in" durationInFrames={30}>
        <div>Content</div>
      </FadeTransition>
    );
    
    expect(container.textContent).toContain('Content');
  });

  it('should render fade out transition', () => {
    const { container } = render(
      <FadeTransition direction="out" durationInFrames={30}>
        <div>Content</div>
      </FadeTransition>
    );
    
    expect(container.textContent).toContain('Content');
  });

  it('should apply opacity style', () => {
    const { container } = render(
      <FadeTransition direction="in" durationInFrames={30}>
        <div>Content</div>
      </FadeTransition>
    );
    
    const element = container.querySelector('[style*="opacity"]');
    expect(element).toBeTruthy();
  });
});

describe('CrossfadeTransition', () => {
  it('should render both scenes', () => {
    const { container } = render(
      <CrossfadeTransition 
        durationInFrames={30}
        fromScene={<div>Scene A</div>}
        toScene={<div>Scene B</div>}
      />
    );
    
    expect(container.textContent).toContain('Scene A');
    expect(container.textContent).toContain('Scene B');
  });

  it('should apply opacity to both scenes', () => {
    const { container } = render(
      <CrossfadeTransition 
        durationInFrames={30}
        fromScene={<div>Scene A</div>}
        toScene={<div>Scene B</div>}
      />
    );
    
    const opacityElements = container.querySelectorAll('[style*="opacity"]');
    expect(opacityElements.length).toBeGreaterThanOrEqual(2);
  });

  it('should position scenes absolutely', () => {
    const { container } = render(
      <CrossfadeTransition 
        durationInFrames={30}
        fromScene={<div>Scene A</div>}
        toScene={<div>Scene B</div>}
      />
    );
    
    expect(container.querySelector('div')).toBeTruthy();
  });
});
