# Performance Tracker Setup Guide

## Phase 2: OAuth Integration - COMPLETED ✅

The OAuth infrastructure is now in place. To enable social media connections, you need to:

### 1. Register Apps with Social Platforms

#### Instagram & Facebook (Meta)
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "Instagram Basic Display" and "Facebook Login" products
4. Get your **App ID** and **App Secret**
5. Add OAuth redirect URI: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback?provider=instagram`

#### TikTok
1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create a new app
3. Get your **Client Key** and **Client Secret**
4. Add redirect URI: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback?provider=tiktok`

#### LinkedIn
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Create a new app
3. Get your **Client ID** and **Client Secret**
4. Add redirect URI: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback?provider=linkedin`

#### X (Twitter)
1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new project and app
3. Enable OAuth 2.0
4. Get your **Client ID** and **Client Secret**
5. Add redirect URI: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback?provider=x`

#### YouTube (Google)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials
5. Get your **Client ID** and **Client Secret**
6. Add redirect URI: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback?provider=youtube`

### 2. Add Secrets to Lovable Cloud

Add these as edge function secrets:

```
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

You'll also need to add these as environment variables:
```
VITE_META_APP_ID=your_meta_app_id
VITE_TIKTOK_CLIENT_KEY=your_tiktok_client_key
VITE_LINKEDIN_CLIENT_ID=your_linkedin_client_id
VITE_X_CLIENT_ID=your_x_client_id
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

### 3. Testing OAuth Flow

1. Navigate to `/performance`
2. Click "Connections" tab
3. Click "Connect" on any provider
4. Authorize the app
5. You'll be redirected back with the connection saved
6. Click "Sync Now" to import posts

## Current Features

### ✅ Phase 1: Foundation
- Database tables with RLS policies
- CSV upload with validation
- Overview dashboard with KPIs and charts
- Engagement trends analysis
- Caption insights with AI
- Connections management UI

### ✅ Phase 2: API Integration
- OAuth callback handler for all 6 providers
- Token storage and management
- Sync functionality to import posts
- Account connection/disconnection

### 🚧 Phase 3: Coming Next
- AI insights refinement
- Advanced analytics
- Engagement predictions

### 🚧 Phase 4: Coming Next
- Auto-sync scheduler (daily background jobs)
- Plan limits enforcement (Free vs Pro)
- Advanced filtering and search
- PDF export of reports

## Usage Limits

### Free Plan
- CSV upload only (up to 50 posts)
- No API connections
- No AI insights

### Pro Plan ($39.99/year)
- API connections enabled (up to 3 providers)
- Daily auto-sync
- AI insights active
- Unlimited posts

## API Rate Limits

Each provider has rate limits:
- **Instagram**: 200 calls/hour
- **Facebook**: 200 calls/hour  
- **TikTok**: 100 calls/day
- **LinkedIn**: 100 calls/day
- **X**: 1500 calls/15 minutes
- **YouTube**: 10,000 units/day

The sync function respects these limits and will backoff if needed.

## Troubleshooting

### OAuth redirect fails
- Verify redirect URIs match exactly in provider settings
- Check that secrets are configured correctly
- Ensure Site URL is set in Lovable Cloud auth settings

### No posts imported after sync
- Check edge function logs for errors
- Verify account has posts available via API
- Ensure proper scopes are requested during OAuth

### Token expired
- Click "Sync Now" to automatically refresh token
- If refresh fails, disconnect and reconnect the account

## Next Steps

1. Register apps with social platforms
2. Add secrets to Lovable Cloud
3. Test OAuth connections
4. Import posts via sync or CSV
5. Generate AI insights
6. Analyze performance trends!