-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'de', 'es')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  subscription_current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Captions table
CREATE TABLE public.captions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('friendly', 'professional', 'funny', 'emotional')),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'facebook', 'twitter')),
  caption_text TEXT NOT NULL,
  hashtags TEXT[] NOT NULL,
  language TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking table
CREATE TABLE public.usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- Translations/settings table
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.settings (key, value_json) VALUES
  ('free_limit', '{"limit": 3}'::jsonb),
  ('caption_max_length', '{"length": 250}'::jsonb),
  ('hashtag_count', '{"count": 5}'::jsonb);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for captions
CREATE POLICY "Users can view own captions"
  ON public.captions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own captions"
  ON public.captions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for usage
CREATE POLICY "Users can view own usage"
  ON public.usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON public.usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON public.usage FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for settings (public read)
CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'language', 'en')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger for settings updated_at
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();