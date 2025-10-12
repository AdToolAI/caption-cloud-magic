# Edge Functions API Documentation

This document describes all available Edge Functions in CaptionGenie.

## Table of Contents

- [Authentication](#authentication)
- [AI Content Generation](#ai-content-generation)
- [Analytics](#analytics)
- [Post Management](#post-management)
- [Error Handling](#error-handling)

## Authentication

All Edge Functions require authentication via Supabase Auth. Include the user's session token in requests:

```typescript
const { data, error } = await supabase.functions.invoke('function-name', {
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
  body: { /* request data */ }
});
```

## AI Content Generation

### generate-caption

Generates AI-powered captions for social media posts.

**Endpoint**: `/generate-caption`

**Request Body**:
```typescript
{
  topic: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'twitter' | 'facebook';
  tone: string;
  language: 'en' | 'de' | 'es';
  keywords?: string;
}
```

**Response**:
```typescript
{
  caption: string;
  hashtags: string[];
}
```

**Example**:
```typescript
const { data } = await supabase.functions.invoke('generate-caption', {
  body: {
    topic: 'Morning coffee routine',
    platform: 'instagram',
    tone: 'casual',
    language: 'en',
    keywords: 'coffee, morning, productivity'
  }
});
```

### generate-hooks

Generates attention-grabbing hooks for posts.

**Endpoint**: `/generate-hooks`

**Request Body**:
```typescript
{
  topic: string;
  platform: string;
  audience?: string;
  tone: string;
  language: string;
  styles: string[];
}
```

**Response**:
```typescript
{
  hooks: Array<{
    style: string;
    texts: string[];
  }>;
}
```

### generate-bio

Generates optimized social media bios.

**Endpoint**: `/generate-bio`

**Request Body**:
```typescript
{
  platform: string;
  audience: string;
  topic: string;
  tone: string;
  language: string;
  keywords?: string;
}
```

**Response**:
```typescript
{
  bios: Array<{
    platform: string;
    text: string;
  }>;
  explanation: string;
}
```

### generate-reel-script

Generates scripts for short-form video content.

**Endpoint**: `/generate-reel-script`

**Request Body**:
```typescript
{
  topic: string;
  duration: number;
  style: string;
  hook: string;
  language: string;
}
```

**Response**:
```typescript
{
  script: {
    hook: string;
    body: string;
    cta: string;
  };
  suggestions: string[];
}
```

### generate-post

Generates complete posts from images using vision AI.

**Endpoint**: `/generate-post`

**Request Body**:
```typescript
{
  imageUrl: string;
  description: string;
  platforms: string[];
  style: string;
  tone: string;
  language: string;
  brandKitId?: string;
  ctaLine?: string;
}
```

**Response**:
```typescript
{
  caption: string;
  headline: string;
  hashtags: string[];
  visionDescription: string;
}
```

## Analytics

### analyze-performance

Analyzes post performance data and generates insights.

**Endpoint**: `/analyze-performance`

**Request Body**:
```typescript
{
  startDate: string;
  endDate: string;
  platform?: string;
}
```

**Response**:
```typescript
{
  summary: {
    totalPosts: number;
    avgEngagement: number;
    topPerformers: Array<{
      post_id: string;
      engagement_rate: number;
    }>;
    insights: string[];
  };
}
```

### analyze-hashtags

Analyzes hashtag performance.

**Endpoint**: `/analyze-hashtags`

**Request Body**:
```typescript
{
  platform?: string;
  timeframe?: 'week' | 'month' | 'year';
}
```

**Response**:
```typescript
{
  hashtags: Array<{
    hashtag: string;
    performance: number;
    recommendations: string[];
  }>;
}
```

### identify-best-content

Identifies top-performing content.

**Endpoint**: `/identify-best-content`

**Request Body**:
```typescript
{
  platform?: string;
  limit?: number;
}
```

**Response**:
```typescript
{
  topContent: Array<{
    post_id: string;
    engagement_score: number;
    insights: string[];
  }>;
}
```

## Post Management

### sync-social-posts

Syncs posts from connected social media accounts.

**Endpoint**: `/sync-social-posts`

**Request Body**:
```typescript
{
  provider: 'instagram' | 'tiktok' | 'linkedin';
  accessToken: string;
  accountId: string;
}
```

**Response**:
```typescript
{
  synced: number;
  posts: Array<{
    post_id: string;
    posted_at: string;
    metrics: {
      likes: number;
      comments: number;
      shares: number;
    };
  }>;
}
```

## Specialized Features

### analyze-posting-times

Recommends optimal posting times based on audience behavior.

**Endpoint**: `/analyze-posting-times`

**Request Body**:
```typescript
{
  platform: string;
  timezone: string;
  niche?: string;
  goal?: string;
}
```

**Response**:
```typescript
{
  recommendations: Array<{
    day: string;
    times: string[];
    rationale: string;
  }>;
}
```

### analyze-comments

Analyzes comments with sentiment and intent detection.

**Endpoint**: `/analyze-comments`

**Request Body**:
```typescript
{
  comments: Array<{
    id: string;
    text: string;
  }>;
  generateReplies: boolean;
  language: string;
}
```

**Response**:
```typescript
{
  analyzed: Array<{
    id: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    intent: string;
    suggestedReply?: string;
  }>;
}
```

### generate-campaign

Generates comprehensive content campaigns.

**Endpoint**: `/generate-campaign`

**Request Body**:
```typescript
{
  title: string;
  goal: string;
  topic: string;
  tone: string;
  audience?: string;
  platforms: string[];
  durationWeeks: number;
  postFrequency: number;
  language: string;
}
```

**Response**:
```typescript
{
  summary: string;
  posts: Array<{
    week: number;
    day: string;
    title: string;
    type: string;
    outline: string;
    hashtags: string[];
  }>;
}
```

## Error Handling

All Edge Functions follow a consistent error format:

```typescript
{
  error: string;
  details?: any;
}
```

### Common Error Codes

- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid auth token)
- `403` - Forbidden (insufficient permissions)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Example Error Response

```typescript
{
  error: "Invalid platform specified",
  details: {
    received: "invalid-platform",
    expected: ["instagram", "tiktok", "linkedin", "twitter", "facebook"]
  }
}
```

## Rate Limiting

Edge Functions are rate-limited per user:
- Free tier: 100 requests/hour
- Pro tier: 1000 requests/hour
- Enterprise: Custom limits

## Best Practices

1. **Always handle errors**: Check for `error` in responses
2. **Use TypeScript types**: Import types from `@/integrations/supabase/types`
3. **Cache responses**: Use React Query for automatic caching
4. **Batch requests**: Combine multiple operations when possible
5. **Monitor usage**: Track API calls to avoid rate limits

## Testing Edge Functions

```typescript
import { supabase } from '@/integrations/supabase/client';

describe('generate-caption', () => {
  it('should generate a caption', async () => {
    const { data, error } = await supabase.functions.invoke('generate-caption', {
      body: {
        topic: 'Test topic',
        platform: 'instagram',
        tone: 'casual',
        language: 'en'
      }
    });

    expect(error).toBeNull();
    expect(data).toHaveProperty('caption');
    expect(data).toHaveProperty('hashtags');
  });
});
```
