-- Create rewrites_history table
CREATE TABLE public.rewrites_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  rewrite_goal TEXT NOT NULL,
  original_text TEXT NOT NULL,
  rewritten_text TEXT NOT NULL,
  language TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.rewrites_history ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own rewrites"
ON public.rewrites_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own rewrites"
ON public.rewrites_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rewrites"
ON public.rewrites_history
FOR DELETE
USING (auth.uid() = user_id);