-- Create remotion_templates table
CREATE TABLE IF NOT EXISTS public.remotion_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  duration_frames INTEGER NOT NULL,
  fps INTEGER NOT NULL DEFAULT 30,
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1920,
  default_props JSONB NOT NULL DEFAULT '{}',
  customizable_fields JSONB NOT NULL DEFAULT '[]',
  preview_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add render_engine column to content_projects if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content_projects' 
    AND column_name = 'render_engine'
  ) THEN
    ALTER TABLE public.content_projects 
    ADD COLUMN render_engine TEXT NOT NULL DEFAULT 'shotstack' 
    CHECK (render_engine IN ('shotstack', 'remotion'));
  END IF;
END $$;

-- Insert default Remotion templates
INSERT INTO public.remotion_templates (component_name, content_type, duration_frames, fps, width, height, default_props, customizable_fields) VALUES
('ProductAd', 'ad', 450, 30, 1080, 1920, 
  '{"imageUrl": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e", "productName": "Your Product", "tagline": "Amazing product description", "ctaText": "Shop Now"}',
  '[{"key": "imageUrl", "label": "Product Image", "type": "image", "required": true}, {"key": "productName", "label": "Product Name", "type": "text", "required": true}, {"key": "tagline", "label": "Tagline", "type": "textarea", "required": true}, {"key": "ctaText", "label": "CTA Text", "type": "text", "required": true}]'
),
('InstagramStory', 'story', 300, 30, 1080, 1920,
  '{"backgroundUrl": "https://images.unsplash.com/photo-1557683316-973673baf926", "headline": "Story Headline", "text": "Your story content here"}',
  '[{"key": "backgroundUrl", "label": "Background", "type": "image", "required": true}, {"key": "headline", "label": "Headline", "type": "text", "required": true}, {"key": "text", "label": "Story Text", "type": "textarea", "required": true}]'
),
('TikTokReel', 'reel', 900, 30, 1080, 1920,
  '{"videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", "overlayText": "Watch This!", "hashtags": "#viral #trending"}',
  '[{"key": "videoUrl", "label": "Video Clip", "type": "video", "required": true}, {"key": "overlayText", "label": "Overlay Text", "type": "text", "required": true}, {"key": "hashtags", "label": "Hashtags", "type": "text", "required": false}]'
),
('Testimonial', 'testimonial', 600, 30, 1080, 1920,
  '{"customerName": "John Doe", "testimonialText": "This product changed my life!", "rating": 5, "customerPhoto": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e"}',
  '[{"key": "customerName", "label": "Customer Name", "type": "text", "required": true}, {"key": "testimonialText", "label": "Testimonial", "type": "textarea", "required": true}, {"key": "rating", "label": "Rating (1-5)", "type": "number", "required": true}, {"key": "customerPhoto", "label": "Customer Photo", "type": "image", "required": false}]'
),
('Tutorial', 'tutorial', 1200, 30, 1920, 1080,
  '{"title": "How to Tutorial", "steps": ["Step 1", "Step 2", "Step 3"], "voiceoverUrl": ""}',
  '[{"key": "title", "label": "Tutorial Title", "type": "text", "required": true}, {"key": "steps", "label": "Steps (comma-separated)", "type": "textarea", "required": true}, {"key": "voiceoverUrl", "label": "Voiceover Audio", "type": "video", "required": false}]'
)
ON CONFLICT (component_name) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_remotion_templates_content_type ON public.remotion_templates(content_type);
CREATE INDEX IF NOT EXISTS idx_remotion_templates_active ON public.remotion_templates(is_active) WHERE is_active = true;