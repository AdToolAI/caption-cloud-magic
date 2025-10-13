-- Add test_mode_plan column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS test_mode_plan TEXT;

-- Add RLS policy for test_mode_plan (users can only update their own)
CREATE POLICY "Users can update own test_mode_plan" ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Set your account to Pro test mode
UPDATE public.profiles 
SET test_mode_plan = 'pro' 
WHERE id = '9a231d44-847a-4b3a-95e0-7d2b06d62312';