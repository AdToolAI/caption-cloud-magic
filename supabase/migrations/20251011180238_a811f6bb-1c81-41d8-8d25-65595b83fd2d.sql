-- Create post_time_advice table for storing AI-generated posting time recommendations
CREATE TABLE public.post_time_advice (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  timezone TEXT NOT NULL,
  niche TEXT,
  goal TEXT,
  ai_result_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.post_time_advice ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own advice" 
ON public.post_time_advice 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own advice" 
ON public.post_time_advice 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own advice" 
ON public.post_time_advice 
FOR DELETE 
USING (auth.uid() = user_id);