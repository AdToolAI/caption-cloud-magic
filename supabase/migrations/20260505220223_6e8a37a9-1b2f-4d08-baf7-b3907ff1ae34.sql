
-- Personas
CREATE TABLE public.text_studio_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  is_system_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.text_studio_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view system or own personas"
  ON public.text_studio_personas FOR SELECT
  USING (is_system_preset = true OR auth.uid() = user_id);

CREATE POLICY "Users can create own personas"
  ON public.text_studio_personas FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system_preset = false);

CREATE POLICY "Users can update own personas"
  ON public.text_studio_personas FOR UPDATE
  USING (auth.uid() = user_id AND is_system_preset = false);

CREATE POLICY "Users can delete own personas"
  ON public.text_studio_personas FOR DELETE
  USING (auth.uid() = user_id AND is_system_preset = false);

-- Conversations
CREATE TABLE public.text_studio_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Neue Konversation',
  model TEXT NOT NULL,
  persona_id UUID REFERENCES public.text_studio_personas(id) ON DELETE SET NULL,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  total_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.text_studio_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations"
  ON public.text_studio_conversations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_tsc_user_updated ON public.text_studio_conversations(user_id, updated_at DESC);

-- Messages
CREATE TABLE public.text_studio_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.text_studio_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_eur NUMERIC(10,4),
  reasoning_effort TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.text_studio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own messages"
  ON public.text_studio_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_tsm_conversation ON public.text_studio_messages(conversation_id, created_at);

-- Comparisons
CREATE TABLE public.text_studio_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  system_prompt TEXT,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.text_studio_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own comparisons"
  ON public.text_studio_comparisons FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger reuse
CREATE TRIGGER trg_tsp_updated BEFORE UPDATE ON public.text_studio_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tsc_updated BEFORE UPDATE ON public.text_studio_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wallet helpers (reuse ai_video_wallets to avoid a second wallet system)
CREATE OR REPLACE FUNCTION public.deduct_text_studio_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_conversation_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
  v_currency TEXT;
BEGIN
  SELECT balance_euros, currency INTO v_current, v_currency
  FROM ai_video_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE ai_video_wallets
  SET balance_euros = balance_euros - p_amount,
      total_spent_euros = total_spent_euros + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new;

  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'deduction', -p_amount, v_new,
    'AI Text Studio',
    jsonb_build_object('source', 'text_studio', 'conversation_id', p_conversation_id)
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_text_studio_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_conversation_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new NUMERIC;
  v_currency TEXT;
BEGIN
  SELECT currency INTO v_currency FROM ai_video_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  UPDATE ai_video_wallets
  SET balance_euros = balance_euros + p_amount,
      total_spent_euros = GREATEST(0, total_spent_euros - p_amount),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new;

  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'refund', p_amount, v_new,
    'AI Text Studio refund',
    jsonb_build_object('source', 'text_studio', 'conversation_id', p_conversation_id)
  );

  RETURN v_new;
END;
$$;

-- Seed system personas
INSERT INTO public.text_studio_personas (user_id, name, description, system_prompt, is_system_preset) VALUES
  (NULL, 'Strategy Analyst', 'Strukturierte Business- und Markt-Analysen', 'You are a senior strategy consultant. Provide structured, evidence-based analysis with clear frameworks (SWOT, Porter, jobs-to-be-done). Always answer in the user''s language.', true),
  (NULL, 'Senior Copywriter', 'Markentaugliche Texte mit Punch', 'You are a world-class copywriter. Write punchy, on-brand copy with strong hooks and clear CTAs. Match the user''s tone and language.', true),
  (NULL, 'Senior Coder', 'Code-Reviews, Architektur, Bugs', 'You are a principal software engineer. Provide concise, production-grade code in the requested language. Include short reasoning, edge cases, and tests where useful.', true),
  (NULL, 'Researcher', 'Tiefe Recherchen mit Quellen', 'You are a meticulous researcher. Lay out the evidence step-by-step, cite reasoning, and flag uncertainty. Always answer in the user''s language.', true),
  (NULL, 'Brand Voice Editor', 'Texte auf eine Marke trimmen', 'You are a brand voice editor. Rewrite the user''s text to match a consistent, memorable brand voice. Preserve meaning. Answer in the user''s language.', true),
  (NULL, 'Translator', 'Übersetzen DE / EN / ES', 'You are a professional translator. Translate naturally and idiomatically between German, English and Spanish. Keep tone, formatting and intent intact.', true),
  (NULL, 'Social Media Strategist', 'Posts, Hooks, Hashtags', 'You are a social media strategist. Produce platform-aware posts (TikTok, Instagram, LinkedIn, X) with strong hooks, structure and hashtags. Answer in the user''s language.', true);
