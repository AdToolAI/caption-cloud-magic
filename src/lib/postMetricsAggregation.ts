/**
 * Shared aggregation functions for post_metrics data.
 * Used by CaptionInsightsTab and RecoCard.
 */

export const aggregateBestTime = (posts: any[]) => {
  const grouped = posts.reduce((acc, post) => {
    const date = new Date(post.posted_at);
    const weekday = date.getDay();
    const hour = date.getHours();
    const key = `${post.platform}_${weekday}_${hour}`;

    if (!acc[key]) {
      acc[key] = { platform: post.platform, weekday, hour, total: 0, count: 0 };
    }

    const reach = post.reach || 1;
    const engagements = post.engagements || 0;
    acc[key].total += (engagements / reach) * 100;
    acc[key].count += 1;

    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped).map((g: any) => ({
    platform: g.platform,
    weekday: g.weekday,
    hour: g.hour,
    avg_eng_rate: g.total / g.count,
    n: g.count,
  }));
};

export const aggregatePostType = (posts: any[]) => {
  const grouped = posts.reduce((acc, post) => {
    const key = `${post.platform}_${post.media_type || 'unknown'}`;

    if (!acc[key]) {
      acc[key] = { platform: post.platform, post_type: post.media_type || 'unknown', total: 0, count: 0 };
    }

    const reach = post.reach || 1;
    const engagements = post.engagements || 0;
    acc[key].total += (engagements / reach) * 100;
    acc[key].count += 1;

    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped)
    .filter((g: any) => g.count >= 3)
    .map((g: any) => ({
      platform: g.platform,
      post_type: g.post_type,
      avg_eng_rate: g.total / g.count,
      n: g.count,
    }));
};

export const aggregateHashtags = (posts: any[]) => {
  const tagStats = posts.reduce((acc, post) => {
    const hashtags = post.hashtags || [];
    const reach = post.reach || 1;
    const engagements = post.engagements || 0;
    const engRate = (engagements / reach) * 100;

    hashtags.forEach((tag: string) => {
      if (!acc[tag]) {
        acc[tag] = { tag, total: 0, count: 0 };
      }
      acc[tag].total += engRate;
      acc[tag].count += 1;
    });

    return acc;
  }, {} as Record<string, any>);

  return Object.values(tagStats)
    .filter((t: any) => t.count >= 3)
    .map((t: any) => ({
      tag: t.tag,
      avg_eng_rate: t.total / t.count,
      uses: t.count,
    }))
    .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)
    .slice(0, 20);
};

export const aggregateCaptionLength = (posts: any[]) => {
  const grouped = posts.reduce((acc, post) => {
    const len = (post.caption_text || '').length;
    const bucket = len < 80 ? 'kurz' : len <= 220 ? 'mittel' : 'lang';

    if (!acc[bucket]) {
      acc[bucket] = { bucket, total: 0, count: 0 };
    }

    const reach = post.reach || 1;
    const engagements = post.engagements || 0;
    acc[bucket].total += (engagements / reach) * 100;
    acc[bucket].count += 1;

    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped).map((g: any) => ({
    bucket: g.bucket,
    avg_eng_rate: g.total / g.count,
    n: g.count,
  }));
};

export const aggregateTrend = (posts: any[]) => {
  const now = Date.now();
  const recent = posts.filter(p => new Date(p.posted_at).getTime() > now - 7 * 24 * 60 * 60 * 1000);
  const baseline = posts.filter(p => new Date(p.posted_at).getTime() > now - 14 * 24 * 60 * 60 * 1000);

  const avgRate = (arr: any[]) =>
    arr.length === 0
      ? 0
      : arr.reduce((sum, p) => {
          const reach = p.reach || 1;
          const engagements = p.engagements || 0;
          return sum + (engagements / reach) * 100;
        }, 0) / arr.length;

  return { recent7d: avgRate(recent), baseline14d: avgRate(baseline) };
};
