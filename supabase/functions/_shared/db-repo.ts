import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken } from './crypto.ts';

export async function upsertConnection(
  supabase: SupabaseClient,
  data: {
    user_id: string;
    provider: string;
    provider_open_id: string;
    scope: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
  }
) {
  const encryptedAccess = await encryptToken(data.access_token);
  const encryptedRefresh = await encryptToken(data.refresh_token);

  const { data: connection, error } = await supabase
    .from('social_connections')
    .upsert({
      user_id: data.user_id,
      provider: data.provider,
      provider_open_id: data.provider_open_id,
      scope: data.scope,
      account_id: data.provider_open_id,
      account_name: '', // will be filled with profile later
      access_token_hash: encryptedAccess,
      refresh_token_hash: encryptedRefresh,
      token_expires_at: data.expires_at,
      last_sync_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,provider'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting connection:', error);
    throw error;
  }
  
  return connection;
}

export async function getConnectionByUser(
  supabase: SupabaseClient,
  userId: string,
  provider: string
) {
  const { data, error } = await supabase
    .from('social_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    console.error('Error getting connection:', error);
    throw error;
  }
  
  return data;
}

export async function deleteConnection(
  supabase: SupabaseClient,
  userId: string,
  provider: string
) {
  const { error } = await supabase
    .from('social_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.error('Error deleting connection:', error);
    throw error;
  }
}

export async function upsertProfile(
  supabase: SupabaseClient,
  data: {
    user_id: string;
    provider: string;
    username?: string;
    display_name: string;
    avatar_url: string;
    follower_count?: number;
    following_count?: number;
    like_count?: number;
    video_count?: number;
  }
) {
  const { data: profile, error } = await supabase
    .from('social_profiles')
    .upsert({
      ...data,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,provider'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting profile:', error);
    throw error;
  }
  
  return profile;
}
