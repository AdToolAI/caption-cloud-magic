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
      addons: {
        Row: {
          code: string
          created_at: string
          credits: number
          id: string
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          credits: number
          id?: string
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
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
      app_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["app_event_type"]
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload_json: Json
          processed_flags_json: Json
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["app_event_type"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_json?: Json
          processed_flags_json?: Json
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["app_event_type"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_json?: Json
          processed_flags_json?: Json
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_post_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          platform: string
          post_id: string | null
          processed_at: string | null
          recurring_post_id: string | null
          scheduled_at: string
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          platform: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at: string
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          platform?: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at?: string
          status?: string
          user_id?: string
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
      best_content: {
        Row: {
          analyzed_at: string
          caption_text: string | null
          engagement_rate: number | null
          engagement_score: number
          id: string
          insights_json: Json | null
          platform: string
          post_id: string
          posted_at: string
          reach: number | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          caption_text?: string | null
          engagement_rate?: number | null
          engagement_score: number
          id?: string
          insights_json?: Json | null
          platform: string
          post_id: string
          posted_at: string
          reach?: number | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          caption_text?: string | null
          engagement_rate?: number | null
          engagement_score?: number
          id?: string
          insights_json?: Json | null
          platform?: string
          post_id?: string
          posted_at?: string
          reach?: number | null
          user_id?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          code: string
          created_at: string
          features_json: Json
          id: string
          max_concurrent_jobs: number
          max_daily_generations: number
          monthly_credits: number
          name: string
          overage_enabled: boolean
          overage_price_per_credit: number
          seats_included: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          features_json?: Json
          id?: string
          max_concurrent_jobs?: number
          max_daily_generations?: number
          monthly_credits?: number
          name: string
          overage_enabled?: boolean
          overage_price_per_credit?: number
          seats_included?: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          features_json?: Json
          id?: string
          max_concurrent_jobs?: number
          max_daily_generations?: number
          monthly_credits?: number
          name?: string
          overage_enabled?: boolean
          overage_price_per_credit?: number
          seats_included?: number
          sort_order?: number
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
      brand_consistency_history: {
        Row: {
          analyzed_at: string | null
          brand_kit_id: string
          content_id: string | null
          content_type: string
          feedback: Json | null
          id: string
          score: number
          user_id: string
        }
        Insert: {
          analyzed_at?: string | null
          brand_kit_id: string
          content_id?: string | null
          content_type: string
          feedback?: Json | null
          id?: string
          score: number
          user_id: string
        }
        Update: {
          analyzed_at?: string | null
          brand_kit_id?: string
          content_id?: string | null
          content_type?: string
          feedback?: Json | null
          id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_consistency_history_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_content_analysis: {
        Row: {
          brand_kit_id: string
          content_id: string | null
          content_type: string
          created_at: string
          feedback: Json | null
          id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          content_id?: string | null
          content_type: string
          created_at?: string
          feedback?: Json | null
          id?: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          feedback?: Json | null
          id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_content_analysis_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          accent_color: string | null
          ai_comment: string | null
          brand_emotions: Json | null
          brand_name: string | null
          brand_tone: string | null
          brand_values: Json | null
          brand_voice: Json | null
          color_palette: Json
          consistency_score: number | null
          created_at: string | null
          emoji_suggestions: Json | null
          example_caption: string | null
          font_pairing: Json
          id: string
          is_active: boolean | null
          keywords: Json | null
          last_consistency_check: string | null
          logo_url: string | null
          mood: string | null
          neutrals: Json | null
          primary_color: string
          recommended_hashtags: Json | null
          secondary_color: string | null
          shared_with: Json | null
          style_direction: string | null
          target_audience: string | null
          templates_used: Json | null
          usage_examples: Json | null
          user_id: string
          version: number | null
        }
        Insert: {
          accent_color?: string | null
          ai_comment?: string | null
          brand_emotions?: Json | null
          brand_name?: string | null
          brand_tone?: string | null
          brand_values?: Json | null
          brand_voice?: Json | null
          color_palette?: Json
          consistency_score?: number | null
          created_at?: string | null
          emoji_suggestions?: Json | null
          example_caption?: string | null
          font_pairing?: Json
          id?: string
          is_active?: boolean | null
          keywords?: Json | null
          last_consistency_check?: string | null
          logo_url?: string | null
          mood?: string | null
          neutrals?: Json | null
          primary_color: string
          recommended_hashtags?: Json | null
          secondary_color?: string | null
          shared_with?: Json | null
          style_direction?: string | null
          target_audience?: string | null
          templates_used?: Json | null
          usage_examples?: Json | null
          user_id: string
          version?: number | null
        }
        Update: {
          accent_color?: string | null
          ai_comment?: string | null
          brand_emotions?: Json | null
          brand_name?: string | null
          brand_tone?: string | null
          brand_values?: Json | null
          brand_voice?: Json | null
          color_palette?: Json
          consistency_score?: number | null
          created_at?: string | null
          emoji_suggestions?: Json | null
          example_caption?: string | null
          font_pairing?: Json
          id?: string
          is_active?: boolean | null
          keywords?: Json | null
          last_consistency_check?: string | null
          logo_url?: string | null
          mood?: string | null
          neutrals?: Json | null
          primary_color?: string
          recommended_hashtags?: Json | null
          secondary_color?: string | null
          shared_with?: Json | null
          style_direction?: string | null
          target_audience?: string | null
          templates_used?: Json | null
          usage_examples?: Json | null
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      brand_templates: {
        Row: {
          brand_kit_id: string
          created_at: string | null
          id: string
          is_public: boolean | null
          name: string
          template_data: Json
          template_type: string
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          template_data?: Json
          template_type: string
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          template_data?: Json
          template_type?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_templates_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
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
      brand_voice_samples: {
        Row: {
          analyzed_attributes: Json | null
          brand_kit_id: string
          created_at: string | null
          id: string
          sample_text: string
          user_id: string
        }
        Insert: {
          analyzed_attributes?: Json | null
          brand_kit_id: string
          created_at?: string | null
          id?: string
          sample_text: string
          user_id: string
        }
        Update: {
          analyzed_attributes?: Json | null
          brand_kit_id?: string
          created_at?: string | null
          id?: string
          sample_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_voice_samples_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
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
      campaign_roi: {
        Row: {
          budget_spent: number | null
          campaign_name: string
          conversions: number | null
          created_at: string
          end_date: string | null
          id: string
          platform: string
          revenue: number | null
          roi_percent: number | null
          start_date: string
          total_engagement: number | null
          total_reach: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_spent?: number | null
          campaign_name: string
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          platform: string
          revenue?: number | null
          roi_percent?: number | null
          start_date: string
          total_engagement?: number | null
          total_reach?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_spent?: number | null
          campaign_name?: string
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          platform?: string
          revenue?: number | null
          roi_percent?: number | null
          start_date?: string
          total_engagement?: number | null
          total_reach?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      comment_analysis: {
        Row: {
          action: string | null
          analysis_version: number | null
          comment_id: string
          intent: string | null
          language: string | null
          priority_score: number | null
          reply_suggestions: Json | null
          sentiment: string | null
          topics: string[] | null
          toxicity: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          action?: string | null
          analysis_version?: number | null
          comment_id: string
          intent?: string | null
          language?: string | null
          priority_score?: number | null
          reply_suggestions?: Json | null
          sentiment?: string | null
          topics?: string[] | null
          toxicity?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          action?: string | null
          analysis_version?: number | null
          comment_id?: string
          intent?: string | null
          language?: string | null
          priority_score?: number | null
          reply_suggestions?: Json | null
          sentiment?: string | null
          topics?: string[] | null
          toxicity?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_analysis_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
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
      comment_sources: {
        Row: {
          account_handle: string | null
          created_at: string
          external_account_id: string | null
          id: string
          platform: string
          project_id: string
        }
        Insert: {
          account_handle?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform: string
          project_id: string
        }
        Update: {
          account_handle?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          created_at_platform: string | null
          external_comment_id: string | null
          fingerprint: string | null
          id: string
          ingested_at: string
          labels: string[] | null
          language: string | null
          project_id: string
          source_id: string | null
          status: string
          text: string
          user_id_external: string | null
          username: string
        }
        Insert: {
          created_at_platform?: string | null
          external_comment_id?: string | null
          fingerprint?: string | null
          id?: string
          ingested_at?: string
          labels?: string[] | null
          language?: string | null
          project_id: string
          source_id?: string | null
          status?: string
          text: string
          user_id_external?: string | null
          username: string
        }
        Update: {
          created_at_platform?: string | null
          external_comment_id?: string | null
          fingerprint?: string | null
          id?: string
          ingested_at?: string
          labels?: string[] | null
          language?: string | null
          project_id?: string
          source_id?: string | null
          status?: string
          text?: string
          user_id_external?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "comment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      content_approvals: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          created_by: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          submitted_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          created_by: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      content_tasks: {
        Row: {
          assigned_by: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          related_content_id: string | null
          related_content_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_by: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_content_id?: string | null
          related_content_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_content_id?: string | null
          related_content_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          platform: string
          template_data: Json
          thumbnail_url: string | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          platform: string
          template_data?: Json
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          platform?: string
          template_data?: Json
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      cost_table: {
        Row: {
          created_at: string
          description: string
          feature_code: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          feature_code: string
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          feature_code?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json
          reason: Database["public"]["Enums"]["transaction_reason"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json
          reason: Database["public"]["Enums"]["transaction_reason"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json
          reason?: Database["public"]["Enums"]["transaction_reason"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quotas: {
        Row: {
          date: string
          feature_code: string
          id: string
          updated_at: string
          used_credits: number
          used_units: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          date?: string
          feature_code: string
          id?: string
          updated_at?: string
          used_credits?: number
          used_units?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          date?: string
          feature_code?: string
          id?: string
          updated_at?: string
          used_credits?: number
          used_units?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_quotas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      hashtag_performance: {
        Row: {
          avg_engagement_rate: number
          created_at: string
          hashtag: string
          id: string
          last_used_at: string | null
          platform: string
          posts_count: number
          total_engagement: number
          total_reach: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_engagement_rate?: number
          created_at?: string
          hashtag: string
          id?: string
          last_used_at?: string | null
          platform: string
          posts_count?: number
          total_engagement?: number
          total_reach?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_engagement_rate?: number
          created_at?: string
          hashtag?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          posts_count?: number
          total_engagement?: number
          total_reach?: number
          updated_at?: string
          user_id?: string
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
      imports: {
        Row: {
          count_inserted: number
          count_skipped: number
          count_total: number
          created_at: string
          id: string
          project_id: string
          source_id: string | null
        }
        Insert: {
          count_inserted?: number
          count_skipped?: number
          count_total?: number
          created_at?: string
          id?: string
          project_id: string
          source_id?: string | null
        }
        Update: {
          count_inserted?: number
          count_skipped?: number
          count_total?: number
          created_at?: string
          id?: string
          project_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "comment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          alt_text: string | null
          category: string | null
          created_at: string
          description: string | null
          duration: number | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          height: number | null
          id: string
          metadata_json: Json | null
          mime_type: string | null
          tags: Json | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          height?: number | null
          id?: string
          metadata_json?: Json | null
          mime_type?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          metadata_json?: Json | null
          mime_type?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          payload: Json
          sent_at: string
          type: Database["public"]["Enums"]["notification_type"]
          workspace_id: string
        }
        Insert: {
          id?: string
          payload?: Json
          sent_at?: string
          type: Database["public"]["Enums"]["notification_type"]
          workspace_id: string
        }
        Update: {
          id?: string
          payload?: Json
          sent_at?: string
          type?: Database["public"]["Enums"]["notification_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string | null
          csrf_token: string
          expires_at: string
          id: string
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          csrf_token: string
          expires_at: string
          id?: string
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          csrf_token?: string
          expires_at?: string
          id?: string
          provider?: string
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
          error_message: string | null
          external_post_id: string | null
          id: string
          image_url: string | null
          media_urls: Json | null
          platform: string
          published_at: string | null
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
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          image_url?: string | null
          media_urls?: Json | null
          platform: string
          published_at?: string | null
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
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          image_url?: string | null
          media_urls?: Json | null
          platform?: string
          published_at?: string | null
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
          avatar_url: string | null
          brand_color: string | null
          brand_name: string | null
          created_at: string | null
          current_period_end: string | null
          email: string
          id: string
          language: string | null
          name: string | null
          onboarding_completed: boolean | null
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          test_mode_plan: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_color?: string | null
          brand_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email: string
          id: string
          language?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          test_mode_plan?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_color?: string | null
          brand_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email?: string
          id?: string
          language?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          test_mode_plan?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
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
      rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
          request_count: number | null
          updated_at: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      recurring_posts: {
        Row: {
          caption: string
          created_at: string
          frequency: string
          id: string
          image_url: string | null
          is_active: boolean
          last_posted_at: string | null
          next_scheduled_time: string
          platform: string
          tags: Json | null
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption: string
          created_at?: string
          frequency: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_posted_at?: string | null
          next_scheduled_time: string
          platform: string
          tags?: Json | null
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          frequency?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_posted_at?: string | null
          next_scheduled_time?: string
          platform?: string
          tags?: Json | null
          timezone?: string
          title?: string
          updated_at?: string
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
      replies: {
        Row: {
          comment_id: string
          created_at: string
          created_by: string | null
          id: string
          reply_text: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reply_text: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reply_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string
          date_range: string
          description: string | null
          id: string
          include_logo: boolean
          is_default: boolean
          metrics_json: Json
          name: string
          platforms: Json
          sections_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_range?: string
          description?: string | null
          id?: string
          include_logo?: boolean
          is_default?: boolean
          metrics_json?: Json
          name: string
          platforms?: Json
          sections_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_range?: string
          description?: string | null
          id?: string
          include_logo?: boolean
          is_default?: boolean
          metrics_json?: Json
          name?: string
          platforms?: Json
          sections_json?: Json
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
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_update: boolean
          created_at: string
          id: string
          permission: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          permission: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          permission?: string
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      scheduled_reports: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          next_send_date: string
          recipients_json: Json
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          next_send_date: string
          recipients_json?: Json
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          next_send_date?: string
          recipients_json?: Json
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
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
      team_comments: {
        Row: {
          comment_text: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          comment_text: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          comment_text?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "team_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      usage_logs: {
        Row: {
          created_at: string
          credits: number
          feature_code: string
          id: string
          latency_ms: number | null
          meta: Json
          request_id: string | null
          status: Database["public"]["Enums"]["usage_status"]
          units: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          feature_code: string
          id?: string
          latency_ms?: number | null
          meta?: Json
          request_id?: string | null
          status?: Database["public"]["Enums"]["usage_status"]
          units?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          feature_code?: string
          id?: string
          latency_ms?: number | null
          meta?: Json
          request_id?: string | null
          status?: Database["public"]["Enums"]["usage_status"]
          units?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_metrics_daily: {
        Row: {
          auto_replies_sent: number
          avg_engagement: number | null
          captions_rewritten: number
          comments_imported: number
          created_at: string
          date: string
          goals_active: number
          goals_completed: number
          hooks_generated: number
          id: string
          posts_created: number
          posts_published: number
          posts_scheduled: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_replies_sent?: number
          avg_engagement?: number | null
          captions_rewritten?: number
          comments_imported?: number
          created_at?: string
          date: string
          goals_active?: number
          goals_completed?: number
          hooks_generated?: number
          id?: string
          posts_created?: number
          posts_published?: number
          posts_scheduled?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_replies_sent?: number
          avg_engagement?: number | null
          captions_rewritten?: number
          comments_imported?: number
          created_at?: string
          date?: string
          goals_active?: number
          goals_completed?: number
          hooks_generated?: number
          id?: string
          posts_created?: number
          posts_published?: number
          posts_scheduled?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          balance_credits: number
          id: string
          last_top_up_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance_credits?: number
          id?: string
          last_top_up_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance_credits?: number
          id?: string
          last_top_up_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          secret: string
          url: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret: string
          url: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_settings: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          created_at: string
          custom_css: string | null
          custom_domain: string | null
          favicon_url: string | null
          id: string
          login_background_url: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          show_powered_by: boolean
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          custom_css?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_powered_by?: boolean
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          custom_css?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_powered_by?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscription: {
        Row: {
          created_at: string
          id: string
          low_balance_threshold: number
          overage_enabled: boolean
          plan_id: string
          renew_day: number
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          low_balance_threshold?: number
          overage_enabled?: boolean
          plan_id: string
          renew_day?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          low_balance_threshold?: number
          overage_enabled?: boolean
          plan_id?: string
          renew_day?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscription_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_paused: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          owner_user_id: string | null
          settings_json: Json | null
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          owner_user_id?: string | null
          settings_json?: Json | null
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          owner_user_id?: string | null
          settings_json?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_oauth_states: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_user_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["team_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      increment_daily_metric: {
        Args: {
          p_amount?: number
          p_date: string
          p_metric: string
          p_user_id: string
        }
        Returns: undefined
      }
      increment_usage: {
        Args: { date_param: string; user_id_param: string }
        Returns: number
      }
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      user_owns_comment: {
        Args: { _comment_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_event_type:
        | "caption.created"
        | "caption.rewritten"
        | "hook.generated"
        | "reel.script.created"
        | "calendar.post.scheduled"
        | "calendar.post.published"
        | "comment.imported"
        | "comment.replied"
        | "faq.updated"
        | "performance.synced"
        | "trend.bookmarked"
        | "goal.created"
        | "goal.progress.updated"
        | "goal.completed"
        | "brandkit.created"
        | "post.generated"
        | "background.generated"
        | "carousel.created"
        | "bio.generated"
        | "audit.completed"
        | "campaign.created"
        | "performance.account.disconnected"
        | "performance.csv.uploaded"
        | "performance.insights.generated"
      app_role: "owner" | "admin" | "editor" | "viewer"
      approval_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "published"
      goal_status: "active" | "completed" | "paused" | "failed"
      goal_type:
        | "followers"
        | "posts_per_month"
        | "engagement_rate"
        | "content_created"
        | "revenue"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      notification_type: "low_balance" | "paused" | "threshold_hit"
      post_status: "draft" | "scheduled" | "posted"
      subscription_status: "active" | "paused" | "canceled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "review" | "done"
      team_role: "owner" | "admin" | "editor" | "viewer"
      transaction_reason:
        | "monthly_topup"
        | "addon"
        | "debit"
        | "refund"
        | "adjustment"
        | "overage"
      usage_status: "success" | "failed" | "canceled"
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
      app_event_type: [
        "caption.created",
        "caption.rewritten",
        "hook.generated",
        "reel.script.created",
        "calendar.post.scheduled",
        "calendar.post.published",
        "comment.imported",
        "comment.replied",
        "faq.updated",
        "performance.synced",
        "trend.bookmarked",
        "goal.created",
        "goal.progress.updated",
        "goal.completed",
        "brandkit.created",
        "post.generated",
        "background.generated",
        "carousel.created",
        "bio.generated",
        "audit.completed",
        "campaign.created",
        "performance.account.disconnected",
        "performance.csv.uploaded",
        "performance.insights.generated",
      ],
      app_role: ["owner", "admin", "editor", "viewer"],
      approval_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "published",
      ],
      goal_status: ["active", "completed", "paused", "failed"],
      goal_type: [
        "followers",
        "posts_per_month",
        "engagement_rate",
        "content_created",
        "revenue",
      ],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      notification_type: ["low_balance", "paused", "threshold_hit"],
      post_status: ["draft", "scheduled", "posted"],
      subscription_status: ["active", "paused", "canceled"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "review", "done"],
      team_role: ["owner", "admin", "editor", "viewer"],
      transaction_reason: [
        "monthly_topup",
        "addon",
        "debit",
        "refund",
        "adjustment",
        "overage",
      ],
      usage_status: ["success", "failed", "canceled"],
    },
  },
} as const
