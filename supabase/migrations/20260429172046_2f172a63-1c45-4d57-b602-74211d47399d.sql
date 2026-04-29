
-- ============================================================
-- 1) Extend brand_characters with marketplace columns
-- ============================================================
ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS marketplace_status text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS price_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_share_percent integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS total_revenue_credits bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS license_release_path text,
  ADD COLUMN IF NOT EXISTS nsfw_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_video_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voice_sample_url text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE public.brand_characters
    ADD CONSTRAINT brand_characters_marketplace_status_check
    CHECK (marketplace_status IN ('private','draft','pending_review','published','rejected','unlisted','under_investigation','permanent_removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.brand_characters
    ADD CONSTRAINT brand_characters_pricing_type_check
    CHECK (pricing_type IN ('free','premium'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.brand_characters
    ADD CONSTRAINT brand_characters_price_credits_check
    CHECK (price_credits >= 0 AND price_credits <= 5000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.brand_characters
    ADD CONSTRAINT brand_characters_revenue_share_check
    CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.brand_characters
    ADD CONSTRAINT brand_characters_origin_type_check
    CHECK (origin_type IS NULL OR origin_type IN ('ai_generated','licensed_real_person','self_portrait'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_bc_marketplace_published
  ON public.brand_characters (marketplace_status, published_at DESC NULLS LAST)
  WHERE marketplace_status = 'published';

CREATE INDEX IF NOT EXISTS idx_bc_marketplace_pricing
  ON public.brand_characters (pricing_type, marketplace_status);

-- New SELECT policy for published marketplace characters
DROP POLICY IF EXISTS "Anyone authenticated can view published marketplace chars" ON public.brand_characters;
CREATE POLICY "Anyone authenticated can view published marketplace chars"
  ON public.brand_characters FOR SELECT
  TO authenticated
  USING (marketplace_status = 'published' AND archived_at IS NULL);

-- Admin can update any character's marketplace_status (for review/takedown)
DROP POLICY IF EXISTS "Admins can manage marketplace characters" ON public.brand_characters;
CREATE POLICY "Admins can manage marketplace characters"
  ON public.brand_characters FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 2) character_purchases
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  price_credits int NOT NULL DEFAULT 0,
  creator_earned_credits int NOT NULL DEFAULT 0,
  platform_fee_credits int NOT NULL DEFAULT 0,
  pricing_type text NOT NULL CHECK (pricing_type IN ('free','premium')),
  license_version text NOT NULL,
  license_accepted_at timestamptz NOT NULL DEFAULT now(),
  license_ip_hash text,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  UNIQUE (character_id, buyer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_buyer ON public.character_purchases (buyer_user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_creator ON public.character_purchases (creator_user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_character ON public.character_purchases (character_id, purchased_at DESC);

ALTER TABLE public.character_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and creators can view their character purchases"
  ON public.character_purchases FOR SELECT
  TO authenticated
  USING (buyer_user_id = auth.uid() OR creator_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- No direct insert policy: only via SECURITY DEFINER RPC purchase_character

-- ============================================================
-- 3) character_marketplace_consents (creator audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_marketplace_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consents jsonb NOT NULL,
  legal_version text NOT NULL,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_character ON public.character_marketplace_consents (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmc_user ON public.character_marketplace_consents (user_id, created_at DESC);

ALTER TABLE public.character_marketplace_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own consents, admins see all"
  ON public.character_marketplace_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 4) character_marketplace_reports (DMCA / Take-Down)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email text,
  reason text NOT NULL CHECK (reason IN ('impersonation','copyright','minor','deepfake','nsfw','other')),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','dismissed','unlisted','permanent_removed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmr_status ON public.character_marketplace_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmr_character ON public.character_marketplace_reports (character_id);

ALTER TABLE public.character_marketplace_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters and admins can view reports"
  ON public.character_marketplace_reports FOR SELECT
  TO authenticated
  USING (reporter_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can file reports"
  ON public.character_marketplace_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_user_id = auth.uid() OR reporter_user_id IS NULL);

CREATE POLICY "Admins can update reports"
  ON public.character_marketplace_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 5) character_marketplace_ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_marketplace_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, user_id)
);

ALTER TABLE public.character_marketplace_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view ratings"
  ON public.character_marketplace_ratings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Buyers can rate characters they purchased"
  ON public.character_marketplace_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.character_purchases p
      WHERE p.character_id = character_marketplace_ratings.character_id
        AND p.buyer_user_id = auth.uid()
        AND p.refunded_at IS NULL
    )
  );

CREATE POLICY "Users update their own ratings"
  ON public.character_marketplace_ratings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete their own ratings"
  ON public.character_marketplace_ratings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 6) creator_earnings_ledger — add character_id column
-- ============================================================
ALTER TABLE public.creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES public.brand_characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS character_purchase_id uuid REFERENCES public.character_purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'template';

-- ============================================================
-- 7) purchase_character RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_character(
  _character_id uuid,
  _license_version text,
  _license_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buyer uuid := auth.uid();
  _char record;
  _purchase_id uuid;
  _creator_share int;
  _platform_fee int;
  _balance int;
BEGIN
  IF _buyer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  IF _license_version IS NULL OR length(_license_version) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LICENSE_VERSION_REQUIRED');
  END IF;

  SELECT id, user_id, marketplace_status, pricing_type, price_credits, revenue_share_percent
    INTO _char
    FROM public.brand_characters
   WHERE id = _character_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND');
  END IF;

  IF _char.marketplace_status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_PUBLISHED');
  END IF;

  IF _char.user_id = _buyer THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANNOT_BUY_OWN_CHARACTER');
  END IF;

  -- Already purchased?
  SELECT id INTO _purchase_id FROM public.character_purchases
   WHERE character_id = _character_id AND buyer_user_id = _buyer
   LIMIT 1;
  IF _purchase_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_owned', true, 'purchase_id', _purchase_id);
  END IF;

  _creator_share := floor(_char.price_credits * _char.revenue_share_percent / 100.0);
  _platform_fee := _char.price_credits - _creator_share;

  -- Free path
  IF _char.pricing_type = 'free' OR _char.price_credits = 0 THEN
    INSERT INTO public.character_purchases (
      character_id, buyer_user_id, creator_user_id,
      price_credits, creator_earned_credits, platform_fee_credits,
      pricing_type, license_version, license_ip_hash
    ) VALUES (
      _character_id, _buyer, _char.user_id,
      0, 0, 0,
      'free', _license_version, _license_ip_hash
    ) RETURNING id INTO _purchase_id;

    UPDATE public.brand_characters
       SET total_purchases = total_purchases + 1
     WHERE id = _character_id;

    RETURN jsonb_build_object('ok', true, 'purchase_id', _purchase_id, 'price_credits', 0);
  END IF;

  -- Premium path: debit buyer
  SELECT credits_balance INTO _balance FROM public.user_credits WHERE user_id = _buyer FOR UPDATE;
  IF _balance IS NULL OR _balance < _char.price_credits THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_CREDITS', 'required', _char.price_credits, 'balance', COALESCE(_balance,0));
  END IF;

  UPDATE public.user_credits
     SET credits_balance = credits_balance - _char.price_credits,
         updated_at = now()
   WHERE user_id = _buyer;

  -- Credit creator (if still exists)
  IF _char.user_id IS NOT NULL THEN
    INSERT INTO public.user_credits (user_id, credits_balance)
    VALUES (_char.user_id, _creator_share)
    ON CONFLICT (user_id) DO UPDATE
      SET credits_balance = public.user_credits.credits_balance + EXCLUDED.credits_balance,
          updated_at = now();
  END IF;

  -- Record purchase
  INSERT INTO public.character_purchases (
    character_id, buyer_user_id, creator_user_id,
    price_credits, creator_earned_credits, platform_fee_credits,
    pricing_type, license_version, license_ip_hash
  ) VALUES (
    _character_id, _buyer, _char.user_id,
    _char.price_credits, _creator_share, _platform_fee,
    'premium', _license_version, _license_ip_hash
  ) RETURNING id INTO _purchase_id;

  -- Earnings ledger
  IF _char.user_id IS NOT NULL AND _creator_share > 0 THEN
    INSERT INTO public.creator_earnings_ledger (
      creator_user_id, character_id, character_purchase_id,
      credits_earned, source_type
    ) VALUES (
      _char.user_id, _character_id, _purchase_id,
      _creator_share, 'character'
    );
  END IF;

  -- Aggregates
  UPDATE public.brand_characters
     SET total_purchases = total_purchases + 1,
         total_revenue_credits = total_revenue_credits + _char.price_credits
   WHERE id = _character_id;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', _purchase_id,
    'price_credits', _char.price_credits,
    'creator_earned', _creator_share,
    'platform_fee', _platform_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_character(uuid, text, text) TO authenticated;

-- ============================================================
-- 8) Storage bucket: character-licenses (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('character-licenses', 'character-licenses', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for character-licenses bucket
DROP POLICY IF EXISTS "Owners can upload license docs" ON storage.objects;
CREATE POLICY "Owners can upload license docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'character-licenses'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners can read their license docs" ON storage.objects;
CREATE POLICY "Owners can read their license docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'character-licenses'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS "Owners can delete their license docs" ON storage.objects;
CREATE POLICY "Owners can delete their license docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'character-licenses'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 9) Update average_rating trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_character_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid := COALESCE(NEW.character_id, OLD.character_id);
  _avg numeric(3,2);
  _cnt int;
BEGIN
  SELECT COALESCE(AVG(rating), 0)::numeric(3,2), COUNT(*)
    INTO _avg, _cnt
    FROM public.character_marketplace_ratings
   WHERE character_id = _cid;
  UPDATE public.brand_characters
     SET average_rating = _avg, total_ratings = _cnt
   WHERE id = _cid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_character_rating ON public.character_marketplace_ratings;
CREATE TRIGGER trg_refresh_character_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.character_marketplace_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_character_rating();
