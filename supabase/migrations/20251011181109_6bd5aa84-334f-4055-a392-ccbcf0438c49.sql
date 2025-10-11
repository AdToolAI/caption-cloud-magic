-- Create hooks_history table for storing AI-generated hooks
CREATE TABLE public.hooks_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  tone TEXT NOT NULL,
  audience TEXT,
  topic TEXT NOT NULL,
  styles_json JSONB NOT NULL,
  hooks_json JSONB NOT NULL,
  language TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.hooks_history ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own hooks" 
ON public.hooks_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own hooks" 
ON public.hooks_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hooks" 
ON public.hooks_history 
FOR DELETE 
USING (auth.uid() = user_id);