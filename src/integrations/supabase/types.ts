export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_posts: {
        Row: {
          brand_kit_id: string | null
          caption: string | null
          created_at: string
          cta_line: string | null
          description: string
          exports_json: Json
          has_watermark: boolean
          hashtags: Json
          headline: string | null
          id: string
          image_url: string
          language: string
          platforms: Json
          style: string
          tone: string
          updated_at: string
          user_id: string
          vision_json: Json
        }
        Insert: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string
          cta_line?: string | null
          description: string
          exports_json?: Json
          has_watermark?: boolean
          hashtags?: Json
          headline?: string | null
          id?: string
          image_url: string
          language?: string
          platforms?: Json
          style?: string
          tone?: string
          updated_at?: string
          user_id: string
          vision_json?: Json
        }
        Update: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string
          cta_line?: string | null
          description?: string
          exports_json?: Json
          has_watermark?: boolean
          hashtags?: Json
          headline?: string | null
          id?: string
          image_url?: string
          language?: string
          platforms?: Json
          style?: string
          tone?: string
          updated_at?: string
          user_id?: string
          vision_json?: Json
        }
        Relationships: []
      }
      background_projects: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          cutout_image_url: string | null
          id: string
          language: string
          lighting: string
          original_image_url: string
          results_json: Json
          style_intensity: number
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lighting?: string
          original_image_url: string
          results_json?: Json
          style_intensity?: number
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lighting?: string
          original_image_url?: string
          results_json?: Json
          style_intensity?: number
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bios_history: {
        Row: {
          audience: string
          bios_json: Json
          created_at: string | null
          id: string
          keywords: string | null
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          audience: string
          bios_json: Json
          created_at?: string | null
          id?: string
          keywords?: string | null
          language?: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          audience?: string
          bios_json?: Json
          created_at?: string | null
          id?: string
          keywords?: string | null
          language?: string
          platform?: string
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          ai_comment: string | null
          color_palette: Json
          created_at: string | null
          font_pairing: Json
          id: string
          keywords: Json | null
          logo_url: string | null
          mood: string | null
          primary_color: string
          secondary_color: string | null
          usage_examples: Json | null
          user_id: string
        }
        Insert: {
          ai_comment?: string | null
          color_palette?: Json
          created_at?: string | null
          font_pairing?: Json
          id?: string
          keywords?: Json | null
          logo_url?: string | null
          mood?: string | null
          primary_color: string
          secondary_color?: string | null
          usage_examples?: Json | null
          user_id: string
        }
        Update: {
          ai_comment?: string | null
          color_palette?: Json
          created_at?: string | null
          font_pairing?: Json
          id?: string
          keywords?: Json | null
          logo_url?: string | null
          mood?: string | null
          primary_color?: string
          secondary_color?: string | null
          usage_examples?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      brand_voice: {
        Row: {
          id: string
          keywords: string | null
          tagline: string | null
          tone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          keywords?: string | null
          tagline?: string | null
          tone: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          keywords?: string | null
          tagline?: string | null
          tone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_notes: {
        Row: {
          created_at: string | null
          date: string
          id: string
          note_text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          note_text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          note_text?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_posts: {
        Row: {
          best_time: string | null
          campaign_id: string
          caption_outline: string
          created_at: string
          cta: string | null
          day: string
          generated_caption_id: string | null
          hashtags: Json
          id: string
          post_type: string
          title: string
          week_number: number
        }
        Insert: {
          best_time?: string | null
          campaign_id: string
          caption_outline: string
          created_at?: string
          cta?: string | null
          day: string
          generated_caption_id?: string | null
          hashtags?: Json
          id?: string
          post_type: string
          title: string
          week_number: number
        }
        Update: {
          best_time?: string | null
          campaign_id?: string
          caption_outline?: string
          created_at?: string
          cta?: string | null
          day?: string
          generated_caption_id?: string | null
          hashtags?: Json
          id?: string
          post_type?: string
          title?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ai_json: Json
          audience: string | null
          created_at: string
          duration_weeks: number
          goal: string
          id: string
          platform: Json
          post_frequency: number
          summary: string | null
          title: string
          tone: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_json?: Json
          audience?: string | null
          created_at?: string
          duration_weeks: number
          goal: string
          id?: string
          platform?: Json
          post_frequency?: number
          summary?: string | null
          title: string
          tone: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_json?: Json
          audience?: string | null
          created_at?: string
          duration_weeks?: number
          goal?: string
          id?: string
          platform?: Json
          post_frequency?: number
          summary?: string | null
          title?: string
          tone?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      captions: {
        Row: {
          caption_text: string
          created_at: string | null
          hashtags: string[]
          id: string
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          caption_text: string
          created_at?: string | null
          hashtags: string[]
          id?: string
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          caption_text?: string
          created_at?: string | null
          hashtags?: string[]
          id?: string
          language?: string
          platform?: string
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_assets: {
        Row: {
          created_at: string
          exported_pdf_url: string | null
          exported_png_url: string | null
          id: string
          image_url: string | null
          project_id: string
          slide_index: number
        }
        Insert: {
          created_at?: string
          exported_pdf_url?: string | null
          exported_png_url?: string | null
          id?: string
          image_url?: string | null
          project_id: string
          slide_index: number
        }
        Update: {
          created_at?: string
          exported_pdf_url?: string | null
          exported_png_url?: string | null
          id?: string
          image_url?: string | null
          project_id?: string
          slide_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "carousel_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "carousel_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_projects: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          design_json: Json
          has_watermark: boolean
          id: string
          language: string
          outline_json: Json
          platform: string
          slide_count: number
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          design_json?: Json
          has_watermark?: boolean
          id?: string
          language?: string
          outline_json?: Json
          platform?: string
          slide_count?: number
          template?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          design_json?: Json
          has_watermark?: boolean
          id?: string
          language?: string
          outline_json?: Json
          platform?: string
          slide_count?: number
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousel_projects_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_sessions: {
        Row: {
          created_at: string
          id: string
          language: string
          mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          mode?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          mode?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_faqs: {
        Row: {
          answer: string
          created_at: string
          frequency: number
          id: string
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          frequency?: number
          id?: string
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          frequency?: number
          id?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          ai_replies: Json
          comment_text: string
          created_at: string
          id: string
          intent: string | null
          is_auto_replied: boolean
          is_resolved: boolean
          platform: string
          post_id: string | null
          sentiment: string | null
          sentiment_score: number | null
          timestamp: string | null
          user_id: string
          username: string
        }
        Insert: {
          ai_replies?: Json
          comment_text: string
          created_at?: string
          id?: string
          intent?: string | null
          is_auto_replied?: boolean
          is_resolved?: boolean
          platform: string
          post_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          timestamp?: string | null
          user_id: string
          username: string
        }
        Update: {
          ai_replies?: Json
          comment_text?: string
          created_at?: string
          id?: string
          intent?: string | null
          is_auto_replied?: boolean
          is_resolved?: boolean
          platform?: string
          post_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          timestamp?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      content_audit_items: {
        Row: {
          audit_id: string
          caption: string
          created_at: string
          cta_strength: string
          emotion: string
          engagement_score: number
          id: string
          reading_level: string
          suggestions: Json
          word_count: number
        }
        Insert: {
          audit_id: string
          caption: string
          created_at?: string
          cta_strength: string
          emotion: string
          engagement_score: number
          id?: string
          reading_level: string
          suggestions?: Json
          word_count: number
        }
        Update: {
          audit_id?: string
          caption?: string
          created_at?: string
          cta_strength?: string
          emotion?: string
          engagement_score?: number
          id?: string
          reading_level?: string
          suggestions?: Json
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "content_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      content_audits: {
        Row: {
          ai_json: Json
          avg_score: number | null
          created_at: string
          id: string
          language: string
          platform: string
          source_type: string
          total_captions: number
          user_id: string
        }
        Insert: {
          ai_json?: Json
          avg_score?: number | null
          created_at?: string
          id?: string
          language?: string
          platform: string
          source_type: string
          total_captions?: number
          user_id: string
        }
        Update: {
          ai_json?: Json
          avg_score?: number | null
          created_at?: string
          id?: string
          language?: string
          platform?: string
          source_type?: string
          total_captions?: number
          user_id?: string
        }
        Relationships: []
      }
      feature_registry: {
        Row: {
          category: string
          created_at: string | null
          description_json: Json | null
          enabled: boolean
          icon: string
          id: string
          order: number
          plan: string
          route: string
          titles_json: Json
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description_json?: Json | null
          enabled?: boolean
          icon: string
          id: string
          order: number
          plan: string
          route: string
          titles_json: Json
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description_json?: Json | null
          enabled?: boolean
          icon?: string
          id?: string
          order?: number
          plan?: string
          route?: string
          titles_json?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      hooks_history: {
        Row: {
          audience: string | null
          created_at: string
          hooks_json: Json
          id: string
          language: string
          platform: string
          styles_json: Json
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          hooks_json: Json
          id?: string
          language: string
          platform: string
          styles_json: Json
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          hooks_json?: Json
          id?: string
          language?: string
          platform?: string
          styles_json?: Json
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      image_caption_history: {
        Row: {
          ai_description: string | null
          captions_json: Json
          created_at: string | null
          hashtags_json: Json
          id: string
          image_url: string
          language: string
          platform: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_description?: string | null
          captions_json?: Json
          created_at?: string | null
          hashtags_json?: Json
          id?: string
          image_url: string
          language?: string
          platform: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_description?: string | null
          captions_json?: Json
          created_at?: string | null
          hashtags_json?: Json
          id?: string
          image_url?: string
          language?: string
          platform?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      performance_ai_insights: {
        Row: {
          created_at: string | null
          date_range_end: string
          date_range_start: string
          id: string
          provider: string | null
          summary_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date_range_end: string
          date_range_start: string
          id?: string
          provider?: string | null
          summary_json: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          date_range_end?: string
          date_range_start?: string
          id?: string
          provider?: string | null
          summary_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      post_metrics: {
        Row: {
          account_id: string
          caption_text: string | null
          comments: number | null
          engagement_rate: number | null
          id: string
          imported_at: string | null
          impressions: number | null
          likes: number | null
          media_type: string | null
          post_id: string
          post_url: string | null
          posted_at: string
          provider: string
          reach: number | null
          saves: number | null
          shares: number | null
          user_id: string
          video_views: number | null
        }
        Insert: {
          account_id: string
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          imported_at?: string | null
          impressions?: number | null
          likes?: number | null
          media_type?: string | null
          post_id: string
          post_url?: string | null
          posted_at: string
          provider: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
          video_views?: number | null
        }
        Update: {
          account_id?: string
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          imported_at?: string | null
          impressions?: number | null
          likes?: number | null
          media_type?: string | null
          post_id?: string
          post_url?: string | null
          posted_at?: string
          provider?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          video_views?: number | null
        }
        Relationships: []
      }
      post_time_advice: {
        Row: {
          ai_result_json: Json
          created_at: string
          goal: string | null
          id: string
          niche: string | null
          platform: string
          timezone: string
          user_id: string
        }
        Insert: {
          ai_result_json: Json
          created_at?: string
          goal?: string | null
          id?: string
          niche?: string | null
          platform: string
          timezone: string
          user_id: string
        }
        Update: {
          ai_result_json?: Json
          created_at?: string
          goal?: string | null
          id?: string
          niche?: string | null
          platform?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          image_url: string | null
          platform: string
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          tags: Json | null
          timezone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          platform: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tags?: Json | null
          timezone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          platform?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tags?: Json | null
          timezone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          language: string | null
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          language?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          language?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      prompts: {
        Row: {
          business_type: string
          created_at: string
          explanation: string
          goal: string
          id: string
          keywords: string | null
          optimized_prompt: string
          platform: string
          sample_caption: string
          tone: string
          user_id: string
        }
        Insert: {
          business_type: string
          created_at?: string
          explanation: string
          goal: string
          id?: string
          keywords?: string | null
          optimized_prompt: string
          platform: string
          sample_caption: string
          tone: string
          user_id: string
        }
        Update: {
          business_type?: string
          created_at?: string
          explanation?: string
          goal?: string
          id?: string
          keywords?: string | null
          optimized_prompt?: string
          platform?: string
          sample_caption?: string
          tone?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_scripts: {
        Row: {
          ai_json: Json
          brand_kit_id: string | null
          created_at: string
          duration: string
          id: string
          idea: string
          language: string
          platform: string
          title: string | null
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_json?: Json
          brand_kit_id?: string | null
          created_at?: string
          duration?: string
          id?: string
          idea: string
          language?: string
          platform: string
          title?: string | null
          tone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_json?: Json
          brand_kit_id?: string | null
          created_at?: string
          duration?: string
          id?: string
          idea?: string
          language?: string
          platform?: string
          title?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rewrites_history: {
        Row: {
          created_at: string
          explanation: string
          id: string
          language: string
          original_text: string
          platform: string
          rewrite_goal: string
          rewritten_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          explanation: string
          id?: string
          language: string
          original_text: string
          platform: string
          rewrite_goal: string
          rewritten_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          explanation?: string
          id?: string
          language?: string
          original_text?: string
          platform?: string
          rewrite_goal?: string
          rewritten_text?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value_json: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value_json: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value_json?: Json
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token_hash: string | null
          account_id: string
          account_name: string
          auto_sync_enabled: boolean | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          provider: string
          refresh_token_hash: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_hash?: string | null
          account_id: string
          account_name: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          refresh_token_hash?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_hash?: string | null
          account_id?: string
          account_name?: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          refresh_token_hash?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_goals: {
        Row: {
          ai_estimate: string | null
          created_at: string | null
          current_value: number | null
          end_date: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          platform: string
          progress_percent: number | null
          start_date: string
          status: Database["public"]["Enums"]["goal_status"] | null
          target_value: number
          unit: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_estimate?: string | null
          created_at?: string | null
          current_value?: number | null
          end_date?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          platform: string
          progress_percent?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_value: number
          unit: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_estimate?: string | null
          created_at?: string | null
          current_value?: number | null
          end_date?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          platform?: string
          progress_percent?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_value?: number
          unit?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trend_bookmarks: {
        Row: {
          id: string
          saved_at: string
          trend_id: string
          user_id: string
        }
        Insert: {
          id?: string
          saved_at?: string
          trend_id: string
          user_id: string
        }
        Update: {
          id?: string
          saved_at?: string
          trend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_bookmarks_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trend_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_entries: {
        Row: {
          category: string | null
          created_at: string
          data_json: Json
          description: string | null
          id: string
          language: string
          name: string
          platform: string
          popularity_index: number
          region: string | null
          trend_type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          data_json?: Json
          description?: string | null
          id?: string
          language?: string
          name: string
          platform: string
          popularity_index?: number
          region?: string | null
          trend_type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          data_json?: Json
          description?: string | null
          id?: string
          language?: string
          name?: string
          platform?: string
          popularity_index?: number
          region?: string | null
          trend_type?: string
        }
        Relationships: []
      }
      trend_ideas: {
        Row: {
          created_at: string
          hashtags: Json
          id: string
          ideas_json: Json
          recommended_platforms: Json
          summary: string | null
          trend_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashtags?: Json
          id?: string
          ideas_json?: Json
          recommended_platforms?: Json
          summary?: string | null
          trend_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashtags?: Json
          id?: string
          ideas_json?: Json
          recommended_platforms?: Json
          summary?: string | null
          trend_name?: string
          user_id?: string
        }
        Relationships: []
      }
      usage: {
        Row: {
          count: number | null
          date: string | null
          id: string
          user_id: string
        }
        Insert: {
          count?: number | null
          date?: string | null
          id?: string
          user_id: string
        }
        Update: {
          count?: number | null
          date?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_usage: {
        Args: { date_param: string; user_id_param: string }
        Returns: number
      }
    }
    Enums: {
      goal_status: "active" | "completed" | "paused" | "failed"
      goal_type:
        | "followers"
        | "posts_per_month"
        | "engagement_rate"
        | "content_created"
        | "revenue"
      post_status: "draft" | "scheduled" | "posted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      goal_status: ["active", "completed", "paused", "failed"],
      goal_type: [
        "followers",
        "posts_per_month",
        "engagement_rate",
        "content_created",
        "revenue",
      ],
      post_status: ["draft", "scheduled", "posted"],
    },
  },
} as const
