-- Developer credit top-up: Increase wallet balance to $100 USD for testing
-- User ID: 8948d3d9-2c5e-4405-9e9c-1624448e7189

-- Update wallet balance to $100
UPDATE ai_video_wallets
SET 
  balance_euros = 100.00,
  updated_at = NOW()
WHERE user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189';

-- Record the manual credit transaction (using 'purchase' type)
INSERT INTO ai_video_transactions (
  user_id, 
  currency, 
  type, 
  amount_euros, 
  balance_after, 
  description
)
VALUES (
  '8948d3d9-2c5e-4405-9e9c-1624448e7189',
  'USD',
  'purchase',
  95.00,
  100.00,
  'Developer credit top-up for testing'
);