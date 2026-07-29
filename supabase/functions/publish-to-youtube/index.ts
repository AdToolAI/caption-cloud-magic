import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface ChapterEntry {
  timestamp: string; // "0:00"
  label: string;
}

interface PublishRequest {
  videoUrl: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'private' | 'unlisted';
  categoryId?: string;
  aspectRatio?: string; // "9:16" | "1:1" | "16:9"
  durationSec?: number;
  chapters?: ChapterEntry[]; // strukturierte Chapters
  enableShorts?: boolean; // Override der Auto-Detection
}

const YT_MAX_TITLE = 100;

function isShortFormat(aspectRatio?: string, durationSec?: number, override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  const vertical = aspectRatio === '9:16' || aspectRatio === 'vertical';
  const short = !durationSec || durationSec <= 60;
  return vertical && short;
}

function formatChapters(chapters: ChapterEntry[] | undefined): string {
  if (!chapters || chapters.length < 3) return '';
  const first = chapters[0].timestamp;
  if (first !== '0:00' && first !== '00:00') return '';
  return chapters.map((c) => `${c.timestamp} ${c.label}`).join('\n');
}

function applyShortsMetadata(req: PublishRequest) {
  const isShort = isShortFormat(req.aspectRatio, req.durationSec, req.enableShorts);
  let title = (req.title ?? '').trim();
  let description = (req.description ?? '').trim();
  const chapterBlock = formatChapters(req.chapters);
  if (chapterBlock) description = `${description}\n\n${chapterBlock}`.trim();
  if (isShort) {
    if (!/#shorts/i.test(title)) {
      const max = YT_MAX_TITLE - ' #Shorts'.length;
      if (title.length > max) title = title.slice(0, max - 1).trimEnd() + '…';
      title = `${title} #Shorts`;
    }
    if (!/#shorts/i.test(description)) description = `${description}\n\n#Shorts`.trim();
  }
  const tagSet = new Set((req.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()));
  if (isShort) {
    tagSet.add('shorts');
    tagSet.add('shortvideo');
  }
  return {
    title: title.slice(0, YT_MAX_TITLE),
    description,
    tags: Array.from(tagSet).slice(0, 15),
    isShort,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "publish-to-youtube" });
  }

  try {
    const accessToken = Deno.env.get('YOUTUBE_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('YouTube credentials not configured');
    }

    const { 
      videoUrl, 
      title, 
      description, 
      tags = [], 
      privacyStatus = 'public',
      categoryId = '22' // Default: People & Blogs
    }: PublishRequest = await req.json();

    console.log('Publishing to YouTube:', { title, privacyStatus });

    // Fetch video file
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.arrayBuffer();

    // Step 1: Initialize resumable upload
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': videoBlob.byteLength.toString(),
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify({
          snippet: {
            title: title.substring(0, 100), // YouTube max title length
            description: description,
            tags: tags,
            categoryId: categoryId,
          },
          status: {
            privacyStatus: privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      console.error('Failed to initialize YouTube upload:', error);
      throw new Error(`YouTube API error: ${error}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('No upload URL received from YouTube');
    }

    console.log('Upload URL received:', uploadUrl);

    // Step 2: Upload video
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error('Failed to upload video:', error);
      throw new Error(`YouTube upload error: ${error}`);
    }

    const uploadData = await uploadResponse.json();

    console.log('Successfully published to YouTube:', uploadData);

    return new Response(
      JSON.stringify({
        success: true,
        videoId: uploadData.id,
        message: 'Successfully published to YouTube',
        url: `https://www.youtube.com/watch?v=${uploadData.id}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('YouTube publish error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
