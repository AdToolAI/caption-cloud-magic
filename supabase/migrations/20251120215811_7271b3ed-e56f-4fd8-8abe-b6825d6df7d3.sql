-- Enable RLS on remotion_templates
ALTER TABLE public.remotion_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active templates
CREATE POLICY "Anyone can view active templates" ON public.remotion_templates
  FOR SELECT
  USING (is_active = true);

-- Policy: Only admins can insert templates (for future admin panel)
CREATE POLICY "Only authenticated users can manage templates" ON public.remotion_templates
  FOR ALL
  USING (false); -- Locked down for now, will be opened with admin role later