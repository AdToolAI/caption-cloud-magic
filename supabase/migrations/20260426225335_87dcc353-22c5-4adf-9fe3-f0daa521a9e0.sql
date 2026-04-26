-- ============================================================
-- TEMPLATE MARKETPLACE — Phase 1 Migration
-- ============================================================

-- 1. Erweitere motion_studio_templates um Marketplace-Felder
ALTER TABLE public.motion_studio_templates
  ADD COLUMN IF NOT EXISTS creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace_status text NOT NULL DEFAULT 'draft'
    CHECK (marketplace_status IN ('draft','pending_review','published','rejected','unlisted')),
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'free'
    CHECK (pricing_type IN ('free','premium')),
  ADD COLUMN IF NOT EXISTS price_credits integer NOT NULL DEFAULT 0
    CHECK (price_credits >= 0 AND price_credits <= 5000),
  ADD COLUMN IF NOT EXISTS revenue_share_percent integer NOT NULL DEFAULT 70
    CHECK (revenue_share_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS total_revenue_credits bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_msv_marketplace_status
  ON public.motion_studio_templates(marketplace_status, published_at DESC NULLS LAST)
  WHERE marketplace_status = 'published';

CREATE INDEX IF NOT EXISTS idx_msv_creator
  ON public.motion_studio_templates(creator_user_id)
  WHERE creator_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_msv_pricing_type
  ON public.motion_studio_templates(pricing_type, marketplace_status);

-- 2. Tabelle: template_purchases (Kauf-Ledger)
CREATE TABLE IF NOT EXISTS public.template_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.motion_studio_templates(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  price_credits integer NOT NULL DEFAULT 0,
  creator_earned_credits integer NOT NULL DEFAULT 0,
  platform_fee_credits integer NOT NULL DEFAULT 0,
  pricing_type text NOT NULL CHECK (pricing_type IN ('free','premium')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  CONSTRAINT uq_template_purchase UNIQUE (template_id, buyer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_buyer ON public.template_purchases(buyer_user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_tp_creator ON public.template_purchases(creator_user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_tp_template ON public.template_purchases(template_id, purchased_at DESC);

ALTER TABLE public.template_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see their own purchases"
  ON public.template_purchases FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid() OR creator_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- INSERT geht nur via SECURITY DEFINER RPC; keine direkte INSERT-Policy

-- 3. Tabelle: template_marketplace_ratings
CREATE TABLE IF NOT EXISTS public.template_marketplace_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.motion_studio_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text CHECK (char_length(review_text) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_template_rating UNIQUE (template_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tmr_template ON public.template_marketplace_ratings(template_id, created_at DESC);

ALTER TABLE public.template_marketplace_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view ratings on published templates"
  ON public.template_marketplace_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.motion_studio_templates t
      WHERE t.id = template_id AND t.marketplace_status = 'published'
    ) OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can insert their own ratings"
  ON public.template_marketplace_ratings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own ratings"
  ON public.template_marketplace_ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own ratings"
  ON public.template_marketplace_ratings FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Trigger: aggregate ratings zurück aufs Template
CREATE OR REPLACE FUNCTION public.update_template_marketplace_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid := COALESCE(NEW.template_id, OLD.template_id);
BEGIN
  UPDATE public.motion_studio_templates t
  SET
    average_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.template_marketplace_ratings WHERE template_id = v_template_id), 0),
    total_ratings  = COALESCE((SELECT COUNT(*)::int FROM public.template_marketplace_ratings WHERE template_id = v_template_id), 0),
    updated_at     = now()
  WHERE t.id = v_template_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tmr_aggregate ON public.template_marketplace_ratings;
CREATE TRIGGER trg_tmr_aggregate
  AFTER INSERT OR UPDATE OR DELETE ON public.template_marketplace_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_template_marketplace_rating_stats();

-- 4. Tabelle: creator_earnings_ledger
CREATE TABLE IF NOT EXISTS public.creator_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.motion_studio_templates(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.template_purchases(id) ON DELETE SET NULL,
  credits_earned integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cel_creator ON public.creator_earnings_ledger(creator_user_id, created_at DESC);

ALTER TABLE public.creator_earnings_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators see their own earnings"
  ON public.creator_earnings_ledger FOR SELECT TO authenticated
  USING (creator_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5. Marketplace-spezifische SELECT/UPDATE-Policies auf motion_studio_templates
DROP POLICY IF EXISTS "Marketplace published templates visible to all authenticated" ON public.motion_studio_templates;
CREATE POLICY "Marketplace published templates visible to all authenticated"
  ON public.motion_studio_templates FOR SELECT TO authenticated
  USING (
    marketplace_status = 'published'
    OR creator_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Creators can insert own marketplace templates" ON public.motion_studio_templates;
CREATE POLICY "Creators can insert own marketplace templates"
  ON public.motion_studio_templates FOR INSERT TO authenticated
  WITH CHECK (
    creator_user_id = auth.uid()
    AND marketplace_status IN ('draft','pending_review')
  );

DROP POLICY IF EXISTS "Creators can update own draft templates" ON public.motion_studio_templates;
CREATE POLICY "Creators can update own draft templates"
  ON public.motion_studio_templates FOR UPDATE TO authenticated
  USING (creator_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (creator_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Creators can delete own templates" ON public.motion_studio_templates;
CREATE POLICY "Creators can delete own templates"
  ON public.motion_studio_templates FOR DELETE TO authenticated
  USING (
    (creator_user_id = auth.uid() AND marketplace_status IN ('draft','rejected'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 6. Atomare Kauf-Funktion
CREATE OR REPLACE FUNCTION public.purchase_template(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid := auth.uid();
  v_template public.motion_studio_templates%ROWTYPE;
  v_existing public.template_purchases%ROWTYPE;
  v_buyer_balance integer;
  v_creator_share integer;
  v_platform_fee integer;
  v_purchase_id uuid;
  v_creator_new_balance integer;
BEGIN
  IF v_buyer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_template
  FROM public.motion_studio_templates
  WHERE id = _template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TEMPLATE_NOT_FOUND');
  END IF;

  IF v_template.marketplace_status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TEMPLATE_NOT_PUBLISHED');
  END IF;

  IF v_template.creator_user_id = v_buyer THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CANNOT_BUY_OWN_TEMPLATE');
  END IF;

  -- Idempotenz: existiert bereits?
  SELECT * INTO v_existing
  FROM public.template_purchases
  WHERE template_id = _template_id AND buyer_user_id = v_buyer;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_owned', true,
      'purchase_id', v_existing.id
    );
  END IF;

  -- Free path
  IF v_template.pricing_type = 'free' OR v_template.price_credits = 0 THEN
    INSERT INTO public.template_purchases (
      template_id, buyer_user_id, creator_user_id,
      price_credits, creator_earned_credits, platform_fee_credits, pricing_type
    ) VALUES (
      _template_id, v_buyer, v_template.creator_user_id,
      0, 0, 0, 'free'
    ) RETURNING id INTO v_purchase_id;

    UPDATE public.motion_studio_templates
    SET total_purchases = total_purchases + 1,
        usage_count = usage_count + 1,
        updated_at = now()
    WHERE id = _template_id;

    RETURN jsonb_build_object('ok', true, 'purchase_id', v_purchase_id, 'price_credits', 0);
  END IF;

  -- Premium path: Buyer-Wallet sperren + prüfen
  SELECT balance INTO v_buyer_balance
  FROM public.wallets
  WHERE user_id = v_buyer
  FOR UPDATE;

  IF v_buyer_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WALLET_NOT_FOUND');
  END IF;

  IF v_buyer_balance < v_template.price_credits THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_template.price_credits,
      'balance', v_buyer_balance
    );
  END IF;

  v_creator_share := FLOOR(v_template.price_credits * v_template.revenue_share_percent / 100.0)::int;
  v_platform_fee  := v_template.price_credits - v_creator_share;

  -- Buyer-Wallet abziehen
  UPDATE public.wallets
  SET balance = balance - v_template.price_credits,
      updated_at = now()
  WHERE user_id = v_buyer;

  -- Creator-Wallet gutschreiben (nur wenn Creator existiert + Wallet hat)
  IF v_template.creator_user_id IS NOT NULL AND v_creator_share > 0 THEN
    UPDATE public.wallets
    SET balance = balance + v_creator_share,
        updated_at = now()
    WHERE user_id = v_template.creator_user_id
    RETURNING balance INTO v_creator_new_balance;

    -- Falls Creator (noch) kein Wallet hat: anlegen
    IF v_creator_new_balance IS NULL THEN
      INSERT INTO public.wallets (user_id, balance, plan_code, monthly_credits)
      VALUES (v_template.creator_user_id, v_creator_share, 'free', 100)
      ON CONFLICT (user_id) DO UPDATE
        SET balance = public.wallets.balance + EXCLUDED.balance,
            updated_at = now();
    END IF;
  END IF;

  -- Purchase-Record
  INSERT INTO public.template_purchases (
    template_id, buyer_user_id, creator_user_id,
    price_credits, creator_earned_credits, platform_fee_credits, pricing_type
  ) VALUES (
    _template_id, v_buyer, v_template.creator_user_id,
    v_template.price_credits, v_creator_share, v_platform_fee, 'premium'
  ) RETURNING id INTO v_purchase_id;

  -- Earnings-Ledger
  IF v_template.creator_user_id IS NOT NULL AND v_creator_share > 0 THEN
    INSERT INTO public.creator_earnings_ledger (
      creator_user_id, template_id, purchase_id, credits_earned
    ) VALUES (
      v_template.creator_user_id, _template_id, v_purchase_id, v_creator_share
    );
  END IF;

  -- Template-Statistiken
  UPDATE public.motion_studio_templates
  SET total_purchases = total_purchases + 1,
      total_revenue_credits = total_revenue_credits + v_template.price_credits,
      usage_count = usage_count + 1,
      updated_at = now()
  WHERE id = _template_id;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'price_credits', v_template.price_credits,
    'creator_earned', v_creator_share,
    'platform_fee', v_platform_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_template(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_template(uuid) TO authenticated;

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.template_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_earnings_ledger;

-- 8. updated_at-Trigger für ratings
DROP TRIGGER IF EXISTS trg_tmr_updated_at ON public.template_marketplace_ratings;
CREATE TRIGGER trg_tmr_updated_at
  BEFORE UPDATE ON public.template_marketplace_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();