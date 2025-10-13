-- Enable users to read their own wallet
CREATE POLICY "Users can view their own wallet"
ON public.wallets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Enable users to update their own wallet (needed for credit deductions)
CREATE POLICY "Users can update their own wallet"
ON public.wallets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Enable authenticated users to insert their own wallet (needed for new users)
CREATE POLICY "Users can insert their own wallet"
ON public.wallets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);