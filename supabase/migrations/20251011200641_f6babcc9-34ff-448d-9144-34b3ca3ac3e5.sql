-- Create storage bucket for uploaded images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('image-captions', 'image-captions', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for image uploads
CREATE POLICY "Users can upload their own images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'image-captions' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'image-captions' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'image-captions' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public images are viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'image-captions');

-- Create image caption history table
CREATE TABLE IF NOT EXISTS public.image_caption_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  image_url TEXT NOT NULL,
  ai_description TEXT,
  captions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashtags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.image_caption_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own image captions"
ON public.image_caption_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own image captions"
ON public.image_caption_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image captions"
ON public.image_caption_history
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_image_caption_history_updated_at
BEFORE UPDATE ON public.image_caption_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();