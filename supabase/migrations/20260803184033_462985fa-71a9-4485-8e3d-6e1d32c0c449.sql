INSERT INTO public.ai_video_wallets (user_id, balance_euros, total_purchased_euros)
VALUES ('8948d3d9-2c5e-4405-9e9c-1624448e7189', 500.00, 500.00)
ON CONFLICT (user_id) DO UPDATE
SET balance_euros = public.ai_video_wallets.balance_euros + 500.00,
    total_purchased_euros = public.ai_video_wallets.total_purchased_euros + 500.00,
    updated_at = now();

INSERT INTO public.ai_video_transactions (user_id, type, amount_euros, balance_after, description)
SELECT user_id, 'bonus', 500.00, balance_euros, 'Manuelle Gutschrift: 500 EUR KI-Guthaben'
FROM public.ai_video_wallets WHERE user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189';