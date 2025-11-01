-- Policy: Workspace members can insert content items
CREATE POLICY "wm_content_items_insert" 
ON content_items 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_members.workspace_id = content_items.workspace_id 
    AND workspace_members.user_id = auth.uid()
  )
);