-- Add media columns to campaign_posts
ALTER TABLE public.campaign_posts
ADD COLUMN media_url TEXT,
ADD COLUMN media_type TEXT CHECK (media_type IN ('image', 'video')),
ADD COLUMN media_storage_path TEXT;

-- Create campaign_media table for multiple media per campaign
CREATE TABLE public.campaign_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  file_size_bytes INTEGER,
  mime_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_to_post_id UUID REFERENCES public.campaign_posts(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.campaign_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view media from own campaigns"
  ON public.campaign_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_media.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload media to own campaigns"
  ON public.campaign_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_media.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete media from own campaigns"
  ON public.campaign_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_media.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_campaign_media_campaign_id ON public.campaign_media(campaign_id);
CREATE INDEX idx_campaign_media_post_id ON public.campaign_media(assigned_to_post_id);