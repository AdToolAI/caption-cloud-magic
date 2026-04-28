WITH upd AS (
  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros + 200,
      total_purchased_euros = COALESCE(total_purchased_euros, 0) + 200,
      updated_at = now()
  WHERE user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189'
  RETURNING user_id, currency, balance_euros
)
INSERT INTO public.ai_video_transactions (user_id, currency, type, amount_euros, balance_after, description, metadata)
SELECT user_id, currency, 'bonus', 200, balance_euros, 'Manual admin top-up (+200)', jsonb_build_object('source','admin_manual_topup')
FROM upd;