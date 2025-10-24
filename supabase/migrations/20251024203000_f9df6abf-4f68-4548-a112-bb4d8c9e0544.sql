-- Reset all stripe_customer_id fields to NULL to force creation of new customers in the new Stripe account
UPDATE profiles 
SET stripe_customer_id = NULL 
WHERE stripe_customer_id IS NOT NULL;