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
      ab_test_events: {
        Row: {
          event_type: string
          event_value: number | null
          id: string
          metadata: Json | null
          occurred_at: string | null
          test_id: string
          user_agent: string | null
          variant_id: string
          video_id: string | null
        }
        Insert: {
          event_type: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          test_id: string
          user_agent?: string | null
          variant_id: string
          video_id?: string | null
        }
        Update: {
          event_type?: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          test_id?: string
          user_agent?: string | null
          variant_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_events_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          data: Json | null
          description: string | null
          id: string
          insight_type: string
          test_id: string
          title: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          insight_type: string
          test_id: string
          title: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          insight_type?: string
          test_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_insights_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_variants: {
        Row: {
          avg_watch_time: number | null
          caption: string
          clicks: number | null
          color_config: Json | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string
          customizations: Json | null
          draft_id: string
          engagement: number | null
          engagement_count: number | null
          engagement_rate: number | null
          hashtag_set: string
          hook: string
          id: string
          impressions: number | null
          published_at: string | null
          scheduled_for: string | null
          test_id: string | null
          text_config: Json | null
          thumbnail_config: Json | null
          variant_name: string
          variant_type: string | null
          video_ids: string[] | null
          views: number | null
        }
        Insert: {
          avg_watch_time?: number | null
          caption: string
          clicks?: number | null
          color_config?: Json | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          customizations?: Json | null
          draft_id: string
          engagement?: number | null
          engagement_count?: number | null
          engagement_rate?: number | null
          hashtag_set: string
          hook: string
          id?: string
          impressions?: number | null
          published_at?: string | null
          scheduled_for?: string | null
          test_id?: string | null
          text_config?: Json | null
          thumbnail_config?: Json | null
          variant_name: string
          variant_type?: string | null
          video_ids?: string[] | null
          views?: number | null
        }
        Update: {
          avg_watch_time?: number | null
          caption?: string
          clicks?: number | null
          color_config?: Json | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          customizations?: Json | null
          draft_id?: string
          engagement?: number | null
          engagement_count?: number | null
          engagement_rate?: number | null
          hashtag_set?: string
          hook?: string
          id?: string
          impressions?: number | null
          published_at?: string | null
          scheduled_for?: string | null
          test_id?: string | null
          text_config?: Json | null
          thumbnail_config?: Json | null
          variant_name?: string
          variant_type?: string | null
          video_ids?: string[] | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_variants_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_variants_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_tests: {
        Row: {
          confidence_level: number | null
          created_at: string | null
          ended_at: string | null
          hypothesis: string | null
          id: string
          min_sample_size: number | null
          started_at: string | null
          status: string
          target_metric: string | null
          template_id: string | null
          test_name: string
          updated_at: string | null
          user_id: string
          winner_variant_id: string | null
          workspace_id: string | null
        }
        Insert: {
          confidence_level?: number | null
          created_at?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_size?: number | null
          started_at?: string | null
          status?: string
          target_metric?: string | null
          template_id?: string | null
          test_name: string
          updated_at?: string | null
          user_id: string
          winner_variant_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          confidence_level?: number | null
          created_at?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_size?: number | null
          started_at?: string | null
          status?: string
          target_metric?: string | null
          template_id?: string | null
          test_name?: string
          updated_at?: string | null
          user_id?: string
          winner_variant_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_tests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      active_ai_jobs: {
        Row: {
          id: string
          job_id: string
          job_type: string
          started_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          id?: string
          job_id: string
          job_type: string
          started_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          job_type?: string
          started_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      active_publishes: {
        Row: {
          created_at: string
          id: string
          job_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      affiliates: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          payout_type: string | null
          status: string | null
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          payout_type?: string | null
          status?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          payout_type?: string | null
          status?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json
          job_type: string
          max_retries: number | null
          next_retry_at: string | null
          priority: number | null
          processing_started_at: string | null
          result_data: Json | null
          retry_count: number | null
          status: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data: Json
          job_type: string
          max_retries?: number | null
          next_retry_at?: string | null
          priority?: number | null
          processing_started_at?: string | null
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          job_type?: string
          max_retries?: number | null
          next_retry_at?: string | null
          priority?: number | null
          processing_started_at?: string | null
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      ai_video_generations: {
        Row: {
          artlist_job_id: string | null
          aspect_ratio: string
          completed_at: string | null
          cost_per_second: number
          created_at: string
          duration_seconds: number
          error_message: string | null
          failed_at: string | null
          file_size_bytes: number | null
          id: string
          model: string
          prompt: string
          resolution: string
          retry_count: number | null
          started_at: string | null
          status: string
          storage_path: string | null
          thumbnail_url: string | null
          total_cost_euros: number
          user_id: string
          video_url: string | null
        }
        Insert: {
          artlist_job_id?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          cost_per_second?: number
          created_at?: string
          duration_seconds: number
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          id?: string
          model?: string
          prompt: string
          resolution?: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          total_cost_euros: number
          user_id: string
          video_url?: string | null
        }
        Update: {
          artlist_job_id?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          cost_per_second?: number
          created_at?: string
          duration_seconds?: number
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          id?: string
          model?: string
          prompt?: string
          resolution?: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          total_cost_euros?: number
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      ai_video_transactions: {
        Row: {
          amount_euros: number
          balance_after: number
          bonus_percent: number | null
          created_at: string
          currency: string
          description: string | null
          generation_id: string | null
          id: string
          metadata: Json | null
          pack_size: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount_euros: number
          balance_after: number
          bonus_percent?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          pack_size?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount_euros?: number
          balance_after?: number
          bonus_percent?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          pack_size?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_video_wallets: {
        Row: {
          balance_euros: number
          created_at: string
          currency: string
          id: string
          stripe_payment_method_id: string | null
          total_purchased_euros: number
          total_spent_euros: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_euros?: number
          created_at?: string
          currency?: string
          id?: string
          stripe_payment_method_id?: string | null
          total_purchased_euros?: number
          total_spent_euros?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_euros?: number
          created_at?: string
          currency?: string
          id?: string
          stripe_payment_method_id?: string | null
          total_purchased_euros?: number
          total_spent_euros?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_notifications: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          message: string
          metric_value: number
          resolved_at: string | null
          sent_at: string
          severity: string
          threshold: number
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metric_value: number
          resolved_at?: string | null
          sent_at?: string
          severity: string
          threshold: number
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metric_value?: number
          resolved_at?: string | null
          sent_at?: string
          severity?: string
          threshold?: number
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
      app_secrets: {
        Row: {
          created_at: string
          encrypted_value: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_workflows: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          stages: Json
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          stages: Json
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          stages?: Json
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_post_queue: {
        Row: {
          alt_text: string | null
          attempts: number
          caption: string | null
          created_at: string
          draft_id: string | null
          error_message: string | null
          hashtags: Json | null
          hook: string | null
          id: string
          image_url: string | null
          platform: string
          post_id: string | null
          processed_at: string | null
          recurring_post_id: string | null
          scheduled_at: string
          status: string
          user_id: string
          utm_link: string | null
          variant: string | null
        }
        Insert: {
          alt_text?: string | null
          attempts?: number
          caption?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          image_url?: string | null
          platform: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at: string
          status?: string
          user_id: string
          utm_link?: string | null
          variant?: string | null
        }
        Update: {
          alt_text?: string | null
          attempts?: number
          caption?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          image_url?: string | null
          platform?: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at?: string
          status?: string
          user_id?: string
          utm_link?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_post_queue_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
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
      batch_jobs: {
        Row: {
          completed_at: string | null
          completed_videos: number
          created_at: string
          csv_data: Json
          error_log: Json | null
          failed_videos: number
          id: string
          job_name: string
          started_at: string | null
          status: string
          template_id: string
          total_videos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_videos?: number
          created_at?: string
          csv_data: Json
          error_log?: Json | null
          failed_videos?: number
          id?: string
          job_name: string
          started_at?: string | null
          status?: string
          template_id: string
          total_videos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_videos?: number
          created_at?: string
          csv_data?: Json
          error_log?: Json | null
          failed_videos?: number
          id?: string
          job_name?: string
          started_at?: string | null
          status?: string
          template_id?: string
          total_videos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_renders: {
        Row: {
          completed_at: string | null
          completed_variants: number
          created_at: string
          credits_used: number
          export_settings: Json
          failed_variants: number
          id: string
          project_id: string
          render_results: Json
          status: string
          total_variants: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_variants?: number
          created_at?: string
          credits_used?: number
          export_settings?: Json
          failed_variants?: number
          id?: string
          project_id: string
          render_results?: Json
          status?: string
          total_variants?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_variants?: number
          created_at?: string
          credits_used?: number
          export_settings?: Json
          failed_variants?: number
          id?: string
          project_id?: string
          render_results?: Json
          status?: string
          total_variants?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
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
      bulk_schedule_jobs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string | null
          created_events: number | null
          error_message: string | null
          id: string
          status: string | null
          total_events: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          config: Json
          created_at?: string | null
          created_events?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
          total_events: number
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string | null
          created_events?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
          total_events?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_schedule_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_policies: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_cache_age_days: number | null
          max_cache_size_gb: number | null
          min_hit_count: number | null
          policy_name: string
          priority_templates: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_cache_age_days?: number | null
          max_cache_size_gb?: number | null
          min_hit_count?: number | null
          policy_name: string
          priority_templates?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_cache_age_days?: number | null
          max_cache_size_gb?: number | null
          min_hit_count?: number | null
          policy_name?: string
          priority_templates?: string[] | null
        }
        Relationships: []
      }
      calendar_activity_log: {
        Row: {
          action: string
          changes_json: Json | null
          created_at: string
          entity_type: string
          event_id: string | null
          id: string
          user_id: string | null
          username: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          changes_json?: Json | null
          created_at?: string
          entity_type: string
          event_id?: string | null
          id?: string
          user_id?: string | null
          username?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          changes_json?: Json | null
          created_at?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          user_id?: string | null
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_approvals: {
        Row: {
          approved_changes: Json | null
          approver_email: string | null
          approver_id: string | null
          approver_role: string | null
          comment: string | null
          created_at: string
          event_id: string
          id: string
          review_token: string | null
          reviewed_at: string | null
          stage: string | null
          status: string
          submitted_at: string
          token_expires_at: string | null
        }
        Insert: {
          approved_changes?: Json | null
          approver_email?: string | null
          approver_id?: string | null
          approver_role?: string | null
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          review_token?: string | null
          reviewed_at?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string
          token_expires_at?: string | null
        }
        Update: {
          approved_changes?: Json | null
          approver_email?: string | null
          approver_id?: string | null
          approver_role?: string | null
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          review_token?: string | null
          reviewed_at?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_blackout_dates: {
        Row: {
          all_day: boolean
          brand_kit_id: string | null
          client_id: string | null
          created_at: string
          date: string
          end_time: string | null
          id: string
          note: string
          reason: string | null
          start_time: string | null
          workspace_id: string
        }
        Insert: {
          all_day?: boolean
          brand_kit_id?: string | null
          client_id?: string | null
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          note: string
          reason?: string | null
          start_time?: string | null
          workspace_id: string
        }
        Update: {
          all_day?: boolean
          brand_kit_id?: string | null
          client_id?: string | null
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          note?: string
          reason?: string | null
          start_time?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_blackout_dates_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blackout_dates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blackout_dates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_campaign_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_days: number
          events_json: Json
          id: string
          is_public: boolean | null
          name: string
          template_type: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days: number
          events_json: Json
          id?: string
          is_public?: boolean | null
          name: string
          template_type: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days?: number
          events_json?: Json
          id?: string
          is_public?: boolean | null
          name?: string
          template_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_campaign_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_comments: {
        Row: {
          comment_text: string
          created_at: string
          event_id: string
          id: string
          mentions: string[] | null
          parent_comment_id: string | null
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          event_id: string
          id?: string
          mentions?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          event_id?: string
          id?: string
          mentions?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "calendar_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assets_json: Json | null
          assignees: string[] | null
          attempt_no: number
          auto_render: boolean | null
          brand_kit_id: string | null
          brief: string | null
          campaign_id: string | null
          caption: string | null
          channels: string[]
          client_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          end_at: string | null
          error: Json | null
          eta_minutes: number | null
          hashtags: string[] | null
          id: string
          locked_at: string | null
          locked_by: string | null
          next_retry_at: string | null
          owner_id: string | null
          publish_results: Json | null
          published_at: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["calendar_event_status"]
          tags: string[] | null
          timezone: string
          title: string
          updated_at: string
          version: number
          video_project_id: string | null
          video_render_settings: Json | null
          workspace_id: string
        }
        Insert: {
          assets_json?: Json | null
          assignees?: string[] | null
          attempt_no?: number
          auto_render?: boolean | null
          brand_kit_id?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          channels?: string[]
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          error?: Json | null
          eta_minutes?: number | null
          hashtags?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          next_retry_at?: string | null
          owner_id?: string | null
          publish_results?: Json | null
          published_at?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_status"]
          tags?: string[] | null
          timezone?: string
          title: string
          updated_at?: string
          version?: number
          video_project_id?: string | null
          video_render_settings?: Json | null
          workspace_id: string
        }
        Update: {
          assets_json?: Json | null
          assignees?: string[] | null
          attempt_no?: number
          auto_render?: boolean | null
          brand_kit_id?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          channels?: string[]
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          error?: Json | null
          eta_minutes?: number | null
          hashtags?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          next_retry_at?: string | null
          owner_id?: string | null
          publish_results?: Json | null
          published_at?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_status"]
          tags?: string[] | null
          timezone?: string
          title?: string
          updated_at?: string
          version?: number
          video_project_id?: string | null
          video_render_settings?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          google_calendar_connected: boolean | null
          google_calendar_id: string | null
          google_refresh_token: string | null
          google_sync_direction: string | null
          holiday_region: string | null
          id: string
          settings_json: Json | null
          slack_channel: string | null
          slack_webhook_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          google_calendar_connected?: boolean | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_sync_direction?: string | null
          holiday_region?: string | null
          id?: string
          settings_json?: Json | null
          slack_channel?: string | null
          slack_webhook_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          google_calendar_connected?: boolean | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_sync_direction?: string | null
          holiday_region?: string | null
          id?: string
          settings_json?: Json | null
          slack_channel?: string | null
          slack_webhook_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_integrations_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
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
      calendar_posting_slots: {
        Row: {
          brand_kit_id: string | null
          channels: string[] | null
          client_id: string | null
          created_at: string
          day_of_week: number
          id: string
          max_posts: number | null
          time_slot: string
          workspace_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          channels?: string[] | null
          client_id?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          max_posts?: number | null
          time_slot: string
          workspace_id: string
        }
        Update: {
          brand_kit_id?: string | null
          channels?: string[] | null
          client_id?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          max_posts?: number | null
          time_slot?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_posting_slots_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posting_slots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posting_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_publish_logs: {
        Row: {
          at: string
          event_id: string
          id: string
          level: string
          message: string
          meta: Json | null
          workspace_id: string
        }
        Insert: {
          at?: string
          event_id: string
          id?: string
          level: string
          message: string
          meta?: Json | null
          workspace_id: string
        }
        Update: {
          at?: string
          event_id?: string
          id?: string
          level?: string
          message?: string
          meta?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_publish_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_publish_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_render_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          event_id: string
          id: string
          project_id: string | null
          render_url: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_id: string
          id?: string
          project_id?: string | null
          render_url?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_id?: string
          id?: string
          project_id?: string | null
          render_url?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_render_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_render_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          estimate_minutes: number | null
          event_id: string
          id: string
          owner_id: string | null
          parent_task_id: string | null
          priority: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          event_id: string
          id?: string
          owner_id?: string | null
          parent_task_id?: string | null
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          event_id?: string
          id?: string
          owner_id?: string | null
          parent_task_id?: string | null
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "calendar_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_media: {
        Row: {
          assigned_to_post_id: string | null
          campaign_id: string
          file_size_bytes: number | null
          id: string
          media_type: string
          mime_type: string | null
          public_url: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          assigned_to_post_id?: string | null
          campaign_id: string
          file_size_bytes?: number | null
          id?: string
          media_type: string
          mime_type?: string | null
          public_url: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          assigned_to_post_id?: string | null
          campaign_id?: string
          file_size_bytes?: number | null
          id?: string
          media_type?: string
          mime_type?: string | null
          public_url?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_media_assigned_to_post_id_fkey"
            columns: ["assigned_to_post_id"]
            isOneToOne: false
            referencedRelation: "campaign_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          media_storage_path: string | null
          media_title: string | null
          media_type: string | null
          media_url: string | null
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
          media_storage_path?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
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
          media_storage_path?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
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
      circuit_breaker_state: {
        Row: {
          failure_count: number | null
          last_failure_at: string | null
          last_state_change: string | null
          service_name: string
          state: string
          updated_at: string | null
        }
        Insert: {
          failure_count?: number | null
          last_failure_at?: string | null
          last_state_change?: string | null
          service_name: string
          state: string
          updated_at?: string | null
        }
        Update: {
          failure_count?: number | null
          last_failure_at?: string | null
          last_state_change?: string | null
          service_name?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          settings_json: Json | null
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          settings_json?: Json | null
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          settings_json?: Json | null
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      content_items: {
        Row: {
          caption: string | null
          created_at: string | null
          duration_sec: number | null
          file_size_mb: number | null
          id: string
          media_id: string | null
          source: string | null
          source_id: string | null
          tags: string[] | null
          targets: Json | null
          thumb_url: string | null
          title: string
          type: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          id?: string
          media_id?: string | null
          source?: string | null
          source_id?: string | null
          tags?: string[] | null
          targets?: Json | null
          thumb_url?: string | null
          title: string
          type: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          id?: string
          media_id?: string | null
          source?: string | null
          source_id?: string | null
          tags?: string[] | null
          targets?: Json | null
          thumb_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_projects: {
        Row: {
          audio_config: Json | null
          brief: string | null
          completed_at: string | null
          content_type: string
          created_at: string | null
          credits_used: number | null
          customizations: Json
          export_aspect_ratios: string[] | null
          export_formats: Json | null
          file_size_mb: number | null
          id: string
          output_urls: Json | null
          project_name: string
          render_engine: string | null
          render_id: string | null
          scenes: Json | null
          shared_with: string[] | null
          status: string | null
          storage_bucket: string | null
          template_id: string | null
          thumbnail_urls: Json | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audio_config?: Json | null
          brief?: string | null
          completed_at?: string | null
          content_type: string
          created_at?: string | null
          credits_used?: number | null
          customizations?: Json
          export_aspect_ratios?: string[] | null
          export_formats?: Json | null
          file_size_mb?: number | null
          id?: string
          output_urls?: Json | null
          project_name: string
          render_engine?: string | null
          render_id?: string | null
          scenes?: Json | null
          shared_with?: string[] | null
          status?: string | null
          storage_bucket?: string | null
          template_id?: string | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audio_config?: Json | null
          brief?: string | null
          completed_at?: string | null
          content_type?: string
          created_at?: string | null
          credits_used?: number | null
          customizations?: Json
          export_aspect_ratios?: string[] | null
          export_formats?: Json | null
          file_size_mb?: number | null
          id?: string
          output_urls?: Json | null
          project_name?: string
          render_engine?: string | null
          render_id?: string | null
          scenes?: Json | null
          shared_with?: string[] | null
          status?: string | null
          storage_bucket?: string | null
          template_id?: string | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reviews: {
        Row: {
          comments: Json | null
          created_at: string
          draft_id: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string
          workspace_id: string | null
        }
        Insert: {
          comments?: Json | null
          created_at?: string
          draft_id: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          workspace_id?: string | null
        }
        Update: {
          comments?: Json | null
          created_at?: string
          draft_id?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reviews_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
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
          ai_features: string[] | null
          aspect_ratios: string[] | null
          average_rating: number | null
          category: string
          content_type: string | null
          created_at: string
          created_by: string | null
          customizable_fields: Json | null
          description: string | null
          duration_max: number | null
          duration_min: number | null
          id: string
          is_featured: boolean | null
          is_public: boolean
          name: string
          platform: string
          platforms: string[] | null
          remotion_component_id: string | null
          search_vector: unknown
          tags: string[] | null
          template_data: Json
          thumbnail_url: string | null
          total_ratings: number | null
          updated_at: string
          usage_count: number
          user_id: string | null
          view_count: number | null
        }
        Insert: {
          ai_features?: string[] | null
          aspect_ratios?: string[] | null
          average_rating?: number | null
          category: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json | null
          description?: string | null
          duration_max?: number | null
          duration_min?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          name: string
          platform: string
          platforms?: string[] | null
          remotion_component_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          template_data?: Json
          thumbnail_url?: string | null
          total_ratings?: number | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          view_count?: number | null
        }
        Update: {
          ai_features?: string[] | null
          aspect_ratios?: string[] | null
          average_rating?: number | null
          category?: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json | null
          description?: string | null
          duration_max?: number | null
          duration_min?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          name?: string
          platform?: string
          platforms?: string[] | null
          remotion_component_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          template_data?: Json
          thumbnail_url?: string | null
          total_ratings?: number | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          view_count?: number | null
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
      credit_reservations: {
        Row: {
          actual_amount: number | null
          committed_at: string | null
          created_at: string | null
          expires_at: string | null
          feature_code: string
          id: string
          metadata: Json | null
          reserved_amount: number
          status: string
          user_id: string
        }
        Insert: {
          actual_amount?: number | null
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          feature_code: string
          id?: string
          metadata?: Json | null
          reserved_amount: number
          status?: string
          user_id: string
        }
        Update: {
          actual_amount?: number | null
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          feature_code?: string
          id?: string
          metadata?: Json | null
          reserved_amount?: number
          status?: string
          user_id?: string
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
      credit_usage_events: {
        Row: {
          credits_used: number
          engine: string | null
          feature_code: string
          id: string
          metadata: Json | null
          template_id: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          credits_used: number
          engine?: string | null
          feature_code: string
          id?: string
          metadata?: Json | null
          template_id?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          credits_used?: number
          engine?: string | null
          feature_code?: string
          id?: string
          metadata?: Json | null
          template_id?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage_reports: {
        Row: {
          breakdown_by_engine: Json | null
          breakdown_by_feature: Json | null
          breakdown_by_template: Json | null
          cost_savings_potential: Json | null
          created_at: string | null
          id: string
          period_end: string
          period_start: string
          report_period: string | null
          top_cost_drivers: Json | null
          total_credits_used: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          breakdown_by_engine?: Json | null
          breakdown_by_feature?: Json | null
          breakdown_by_template?: Json | null
          cost_savings_potential?: Json | null
          created_at?: string | null
          id?: string
          period_end: string
          period_start: string
          report_period?: string | null
          top_cost_drivers?: Json | null
          total_credits_used?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          breakdown_by_engine?: Json | null
          breakdown_by_feature?: Json | null
          breakdown_by_template?: Json | null
          cost_savings_potential?: Json | null
          created_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          report_period?: string | null
          top_cost_drivers?: Json | null
          total_credits_used?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_voices: {
        Row: {
          created_at: string | null
          elevenlabs_voice_id: string
          id: string
          is_active: boolean | null
          language: string | null
          name: string
          sample_urls: string[] | null
          updated_at: string | null
          user_id: string
          voice_characteristics: Json | null
        }
        Insert: {
          created_at?: string | null
          elevenlabs_voice_id: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          name: string
          sample_urls?: string[] | null
          updated_at?: string | null
          user_id: string
          voice_characteristics?: Json | null
        }
        Update: {
          created_at?: string | null
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          name?: string
          sample_urls?: string[] | null
          updated_at?: string | null
          user_id?: string
          voice_characteristics?: Json | null
        }
        Relationships: []
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
      export_history: {
        Row: {
          created_at: string
          draft_id: string | null
          export_type: string
          file_url: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          export_type: string
          file_url: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          export_type?: string
          file_url?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_history_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fb_page_daily: {
        Row: {
          created_at: string | null
          date: string
          fans_total: number | null
          id: string
          impressions: number | null
          page_id: string
          post_engagements: number | null
          total_actions: number | null
          video_views: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          fans_total?: number | null
          id?: string
          impressions?: number | null
          page_id: string
          post_engagements?: number | null
          total_actions?: number | null
          video_views?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          fans_total?: number | null
          id?: string
          impressions?: number | null
          page_id?: string
          post_engagements?: number | null
          total_actions?: number | null
          video_views?: number | null
        }
        Relationships: []
      }
      feature_costs: {
        Row: {
          created_at: string | null
          credits_per_use: number
          description: string | null
          feature_code: string
          id: string
        }
        Insert: {
          created_at?: string | null
          credits_per_use: number
          description?: string | null
          feature_code: string
          id?: string
        }
        Update: {
          created_at?: string | null
          credits_per_use?: number
          description?: string | null
          feature_code?: string
          id?: string
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
      generated_templates: {
        Row: {
          analysis_data: Json | null
          created_at: string | null
          generation_metadata: Json | null
          id: string
          source_post_id: string | null
          source_url: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          source_post_id?: string | null
          source_url?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          source_post_id?: string | null
          source_url?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_templates_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
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
      hooks: {
        Row: {
          category: string
          created_at: string
          formula: string
          id: string
          is_default: boolean | null
          performance_score: number | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          formula: string
          id?: string
          is_default?: boolean | null
          performance_score?: number | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          formula?: string
          id?: string
          is_default?: boolean | null
          performance_score?: number | null
          title?: string
          updated_at?: string
          user_id?: string | null
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
      ig_account_daily: {
        Row: {
          created_at: string
          date: string
          followers_count: number
          id: string
          ig_user_id: string
          media_count: number | null
          reach_28d: number | null
          reach_day: number
          reach_week: number | null
        }
        Insert: {
          created_at?: string
          date: string
          followers_count?: number
          id?: string
          ig_user_id: string
          media_count?: number | null
          reach_28d?: number | null
          reach_day?: number
          reach_week?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          followers_count?: number
          id?: string
          ig_user_id?: string
          media_count?: number | null
          reach_28d?: number | null
          reach_day?: number
          reach_week?: number | null
        }
        Relationships: []
      }
      ig_media: {
        Row: {
          caption: string | null
          created_at: string
          ig_user_id: string
          media_id: string
          media_type: Database["public"]["Enums"]["ig_media_type"]
          permalink: string
          thumbnail_url: string | null
          timestamp: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          ig_user_id: string
          media_id: string
          media_type: Database["public"]["Enums"]["ig_media_type"]
          permalink: string
          thumbnail_url?: string | null
          timestamp: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          ig_user_id?: string
          media_id?: string
          media_type?: Database["public"]["Enums"]["ig_media_type"]
          permalink?: string
          thumbnail_url?: string | null
          timestamp?: string
          updated_at?: string
        }
        Relationships: []
      }
      ig_media_metrics: {
        Row: {
          last_updated: string
          media_id: string
          plays: number | null
          reach: number
          saved: number
        }
        Insert: {
          last_updated?: string
          media_id: string
          plays?: number | null
          reach?: number
          saved?: number
        }
        Update: {
          last_updated?: string
          media_id?: string
          plays?: number | null
          reach?: number
          saved?: number
        }
        Relationships: [
          {
            foreignKeyName: "ig_media_metrics_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: true
            referencedRelation: "ig_media"
            referencedColumns: ["media_id"]
          },
        ]
      }
      image_analysis: {
        Row: {
          ai_description: string | null
          brand_color_match: boolean | null
          brightness_score: number | null
          contrast_score: number | null
          created_at: string
          dominant_colors: Json | null
          draft_id: string
          has_faces: boolean | null
          id: string
          image_url: string
          quality_score: number | null
          resolution_height: number | null
          resolution_width: number | null
          text_percentage: number | null
        }
        Insert: {
          ai_description?: string | null
          brand_color_match?: boolean | null
          brightness_score?: number | null
          contrast_score?: number | null
          created_at?: string
          dominant_colors?: Json | null
          draft_id: string
          has_faces?: boolean | null
          id?: string
          image_url: string
          quality_score?: number | null
          resolution_height?: number | null
          resolution_width?: number | null
          text_percentage?: number | null
        }
        Update: {
          ai_description?: string | null
          brand_color_match?: boolean | null
          brightness_score?: number | null
          contrast_score?: number | null
          created_at?: string
          dominant_colors?: Json | null
          draft_id?: string
          has_faces?: boolean | null
          id?: string
          image_url?: string
          quality_score?: number | null
          resolution_height?: number | null
          resolution_width?: number | null
          text_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "image_analysis_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
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
      kv_secrets_backup: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_value: string
          expires_at: string | null
          id: number
          name: string
          scopes: Json | null
          token_hash: string
          token_last6: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_value: string
          expires_at?: string | null
          id?: number
          name: string
          scopes?: Json | null
          token_hash: string
          token_last6: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_value?: string
          expires_at?: string | null
          id?: number
          name?: string
          scopes?: Json | null
          token_hash?: string
          token_last6?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          created_at: string | null
          duration_sec: number | null
          height: number | null
          id: string
          mime: string | null
          original_url: string | null
          size_bytes: number | null
          source: string
          storage_path: string | null
          type: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string | null
          duration_sec?: number | null
          height?: number | null
          id?: string
          mime?: string | null
          original_url?: string | null
          size_bytes?: number | null
          source: string
          storage_path?: string | null
          type: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string | null
          duration_sec?: number | null
          height?: number | null
          id?: string
          mime?: string | null
          original_url?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          type?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
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
      media_profiles: {
        Row: {
          account_id: string | null
          config: Json
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          platform: string
          type: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          config: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          platform: string
          type?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          platform?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          approval_request_notify: boolean | null
          created_at: string | null
          deadline_reminder_hours: number | null
          email_reminders: boolean | null
          in_app_notifications: boolean | null
          render_complete_notify: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approval_request_notify?: boolean | null
          created_at?: string | null
          deadline_reminder_hours?: number | null
          email_reminders?: boolean | null
          in_app_notifications?: boolean | null
          render_complete_notify?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approval_request_notify?: boolean | null
          created_at?: string | null
          deadline_reminder_hours?: number | null
          email_reminders?: boolean | null
          in_app_notifications?: boolean | null
          render_complete_notify?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          message: string | null
          metadata: Json | null
          read: boolean | null
          sent_via_email: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          sent_via_email?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          sent_via_email?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
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
          code_challenge: string | null
          code_challenge_method: string | null
          code_verifier: string | null
          created_at: string | null
          csrf_token: string
          expires_at: string
          id: string
          provider: string
          state: string | null
          user_id: string
        }
        Insert: {
          code_challenge?: string | null
          code_challenge_method?: string | null
          code_verifier?: string | null
          created_at?: string | null
          csrf_token: string
          expires_at: string
          id?: string
          provider: string
          state?: string | null
          user_id: string
        }
        Update: {
          code_challenge?: string | null
          code_challenge_method?: string | null
          code_verifier?: string | null
          created_at?: string | null
          csrf_token?: string
          expires_at?: string
          id?: string
          provider?: string
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          currency: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          referral_id: string | null
          status: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          referral_id?: string | null
          status?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          referral_id?: string | null
          status?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
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
      plan_rate_limits: {
        Row: {
          ai_calls_per_minute: number
          api_calls_per_minute: number
          concurrent_ai_jobs: number
          created_at: string | null
          plan_code: string
          storage_quota_mb: number
          updated_at: string | null
        }
        Insert: {
          ai_calls_per_minute: number
          api_calls_per_minute: number
          concurrent_ai_jobs: number
          created_at?: string | null
          plan_code: string
          storage_quota_mb: number
          updated_at?: string | null
        }
        Update: {
          ai_calls_per_minute?: number
          api_calls_per_minute?: number
          concurrent_ai_jobs?: number
          created_at?: string | null
          plan_code?: string
          storage_quota_mb?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_credentials: {
        Row: {
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_verified_at: string | null
          platform: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          platform: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          platform?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_limits: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          max_caption_length: number | null
          max_hashtags: number | null
          max_media_count: number | null
          platform: string
          rate_limit_per_hour: number | null
          supported_ratios: string[] | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          max_caption_length?: number | null
          max_hashtags?: number | null
          max_media_count?: number | null
          platform: string
          rate_limit_per_hour?: number | null
          supported_ratios?: string[] | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          max_caption_length?: number | null
          max_hashtags?: number | null
          max_media_count?: number | null
          platform?: string
          rate_limit_per_hour?: number | null
          supported_ratios?: string[] | null
        }
        Relationships: []
      }
      post_drafts: {
        Row: {
          ai_output_json: Json | null
          alt_text: string | null
          brand_kit_id: string | null
          brief: string
          caption: string
          caption_b: string | null
          compliance: Json | null
          created_at: string
          crops: Json | null
          cta_input: string | null
          export_bundle_url: string | null
          exported_at: string | null
          hashtags: Json
          hooks: Json
          id: string
          image_url: string | null
          image_urls: Json | null
          languages: Json
          media_type: string | null
          media_url: string | null
          options: Json
          platforms: Json
          review_id: string | null
          scores: Json | null
          status: string
          style_preset: string
          tone_override: string | null
          updated_at: string
          user_id: string
          utm: Json | null
          utm_link: string | null
        }
        Insert: {
          ai_output_json?: Json | null
          alt_text?: string | null
          brand_kit_id?: string | null
          brief: string
          caption: string
          caption_b?: string | null
          compliance?: Json | null
          created_at?: string
          crops?: Json | null
          cta_input?: string | null
          export_bundle_url?: string | null
          exported_at?: string | null
          hashtags?: Json
          hooks?: Json
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          languages?: Json
          media_type?: string | null
          media_url?: string | null
          options?: Json
          platforms?: Json
          review_id?: string | null
          scores?: Json | null
          status?: string
          style_preset?: string
          tone_override?: string | null
          updated_at?: string
          user_id: string
          utm?: Json | null
          utm_link?: string | null
        }
        Update: {
          ai_output_json?: Json | null
          alt_text?: string | null
          brand_kit_id?: string | null
          brief?: string
          caption?: string
          caption_b?: string | null
          compliance?: Json | null
          created_at?: string
          crops?: Json | null
          cta_input?: string | null
          export_bundle_url?: string | null
          exported_at?: string | null
          hashtags?: Json
          hooks?: Json
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          languages?: Json
          media_type?: string | null
          media_url?: string | null
          options?: Json
          platforms?: Json
          review_id?: string | null
          scores?: Json | null
          status?: string
          style_preset?: string
          tone_override?: string | null
          updated_at?: string
          user_id?: string
          utm?: Json | null
          utm_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_drafts_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      post_jobs: {
        Row: {
          calendar_event_id: string | null
          content_snapshot: Json
          created_at: string | null
          error: string | null
          id: string
          platform: string
          posted_at: string | null
          run_at: string
          schedule_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          content_snapshot: Json
          created_at?: string | null
          error?: string | null
          id?: string
          platform: string
          posted_at?: string | null
          run_at: string
          schedule_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          calendar_event_id?: string | null
          content_snapshot?: Json
          created_at?: string | null
          error?: string | null
          id?: string
          platform?: string
          posted_at?: string | null
          run_at?: string
          schedule_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_jobs_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_jobs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          account_id: string
          caption_text: string | null
          comments: number | null
          engagement_rate: number | null
          external_id: string | null
          fetched_at: string | null
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
          reshares: number | null
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
          external_id?: string | null
          fetched_at?: string | null
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
          reshares?: number | null
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
          external_id?: string | null
          fetched_at?: string | null
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
          reshares?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          video_views?: number | null
        }
        Relationships: []
      }
      post_optimizations: {
        Row: {
          applied_at: string | null
          applied_improvements: string[] | null
          created_at: string | null
          draft_id: string | null
          id: string
          optimization_score: number | null
          original_data: Json
          performance_after: Json | null
          performance_before: Json | null
          post_id: string | null
          suggested_improvements: Json
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_improvements?: string[] | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          optimization_score?: number | null
          original_data: Json
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          suggested_improvements: Json
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_improvements?: string[] | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          optimization_score?: number | null
          original_data?: Json
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          suggested_improvements?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_optimizations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_optimizations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
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
      posting_slots: {
        Row: {
          account_id: string
          features: Json | null
          generated_at: string
          id: string
          platform: string
          reasons: string[] | null
          score: number
          slot_end: string
          slot_start: string
          user_id: string
        }
        Insert: {
          account_id: string
          features?: Json | null
          generated_at?: string
          id?: string
          platform: string
          reasons?: string[] | null
          score: number
          slot_end: string
          slot_start: string
          user_id: string
        }
        Update: {
          account_id?: string
          features?: Json | null
          generated_at?: string
          id?: string
          platform?: string
          reasons?: string[] | null
          score?: number
          slot_end?: string
          slot_start?: string
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
      posts_history: {
        Row: {
          account_id: string
          clicks: number | null
          comments: number | null
          created_at: string | null
          engagement_score: number | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string
          post_id: string
          published_at: string
          raw: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          user_id: string
          watch_time_seconds: number | null
        }
        Insert: {
          account_id: string
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform: string
          post_id: string
          published_at: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
          watch_time_seconds?: number | null
        }
        Update: {
          account_id?: string
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string
          post_id?: string
          published_at?: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          watch_time_seconds?: number | null
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
          email_verified: boolean | null
          id: string
          language: string | null
          name: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          plan: string | null
          storage_limit_mb: number | null
          storage_used_mb: number | null
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
          email_verified?: boolean | null
          id: string
          language?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          plan?: string | null
          storage_limit_mb?: number | null
          storage_used_mb?: number | null
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
          email_verified?: boolean | null
          id?: string
          language?: string | null
          name?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          plan?: string | null
          storage_limit_mb?: number | null
          storage_used_mb?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          test_mode_plan?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string
          project_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by: string
          project_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_links: {
        Row: {
          allow_comments: boolean
          allow_download: boolean
          created_at: string
          created_by: string
          current_views: number
          expires_at: string
          id: string
          max_views: number | null
          password_hash: string | null
          project_id: string
          require_password: boolean
          share_token: string
        }
        Insert: {
          allow_comments?: boolean
          allow_download?: boolean
          created_at?: string
          created_by: string
          current_views?: number
          expires_at: string
          id?: string
          max_views?: number | null
          password_hash?: string | null
          project_id: string
          require_password?: boolean
          share_token: string
        }
        Update: {
          allow_comments?: boolean
          allow_download?: boolean
          created_at?: string
          created_by?: string
          current_views?: number
          expires_at?: string
          id?: string
          max_views?: number | null
          password_hash?: string | null
          project_id?: string
          require_password?: boolean
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
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
      promo_codes: {
        Row: {
          active: boolean | null
          affiliate_id: string | null
          code: string
          created_at: string
          discount_percent: number | null
          duration_months: number | null
          id: string
          max_redemptions: number | null
          redemptions_count: number | null
          stripe_promo_id: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean | null
          affiliate_id?: string | null
          code: string
          created_at?: string
          discount_percent?: number | null
          duration_months?: number | null
          id?: string
          max_redemptions?: number | null
          redemptions_count?: number | null
          stripe_promo_id: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean | null
          affiliate_id?: string | null
          code?: string
          created_at?: string
          discount_percent?: number | null
          duration_months?: number | null
          id?: string
          max_redemptions?: number | null
          redemptions_count?: number | null
          stripe_promo_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
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
      publish_jobs: {
        Row: {
          channel_offsets: Json | null
          channels: string[]
          created_at: string
          id: string
          media: Json | null
          text_content: string | null
          user_id: string
        }
        Insert: {
          channel_offsets?: Json | null
          channels: string[]
          created_at?: string
          id?: string
          media?: Json | null
          text_content?: string | null
          user_id: string
        }
        Update: {
          channel_offsets?: Json | null
          channels?: string[]
          created_at?: string
          id?: string
          media?: Json | null
          text_content?: string | null
          user_id?: string
        }
        Relationships: []
      }
      publish_logs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          job_id: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          provider: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_results: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          external_id: string | null
          id: string
          job_id: string
          ok: boolean
          permalink: string | null
          provider: string
          transform_report: Json | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          job_id: string
          ok: boolean
          permalink?: string | null
          provider: string
          transform_report?: Json | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          job_id?: string
          ok?: boolean
          permalink?: string | null
          provider?: string
          transform_report?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_state: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          last_refill_at: string | null
          limit_type: string
          tokens_remaining: number
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          last_refill_at?: string | null
          limit_type: string
          tokens_remaining?: number
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          last_refill_at?: string | null
          limit_type?: string
          tokens_remaining?: number
          window_end?: string
          window_start?: string
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
      recurring_event_rules: {
        Row: {
          auto_render: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_execution: string | null
          name: string
          next_execution: string | null
          recurrence_pattern: string
          template_event: Json
          updated_at: string | null
          video_template_id: string | null
          workspace_id: string
        }
        Insert: {
          auto_render?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          name: string
          next_execution?: string | null
          recurrence_pattern: string
          template_event: Json
          updated_at?: string | null
          video_template_id?: string | null
          workspace_id: string
        }
        Update: {
          auto_render?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          name?: string
          next_execution?: string | null
          recurrence_pattern?: string
          template_event?: Json
          updated_at?: string | null
          video_template_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_event_rules_video_template_id_fkey"
            columns: ["video_template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_event_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      referrals: {
        Row: {
          affiliate_id: string
          customer_id: string
          ended_at: string | null
          id: string
          promo_code_id: string | null
          started_at: string
          status: string | null
          subscription_id: string
        }
        Insert: {
          affiliate_id: string
          customer_id: string
          ended_at?: string | null
          id?: string
          promo_code_id?: string | null
          started_at?: string
          status?: string | null
          subscription_id: string
        }
        Update: {
          affiliate_id?: string
          customer_id?: string
          ended_at?: string | null
          id?: string
          promo_code_id?: string | null
          started_at?: string
          status?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      remotion_templates: {
        Row: {
          component_name: string
          content_type: string
          created_at: string
          customizable_fields: Json
          default_props: Json
          duration_frames: number
          fps: number
          height: number
          id: string
          is_active: boolean
          preview_url: string | null
          updated_at: string
          width: number
        }
        Insert: {
          component_name: string
          content_type: string
          created_at?: string
          customizable_fields?: Json
          default_props?: Json
          duration_frames: number
          fps?: number
          height?: number
          id?: string
          is_active?: boolean
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Update: {
          component_name?: string
          content_type?: string
          created_at?: string
          customizable_fields?: Json
          default_props?: Json
          duration_frames?: number
          fps?: number
          height?: number
          id?: string
          is_active?: boolean
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      render_asset_cache: {
        Row: {
          content_hash: string
          created_at: string | null
          duration_sec: number | null
          engine: string
          expires_at: string | null
          file_size_mb: number | null
          hit_count: number | null
          id: string
          last_accessed_at: string | null
          resolution: string | null
          storage_path: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string | null
          duration_sec?: number | null
          engine: string
          expires_at?: string | null
          file_size_mb?: number | null
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          resolution?: string | null
          storage_path: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string | null
          duration_sec?: number | null
          engine?: string
          expires_at?: string | null
          file_size_mb?: number | null
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          resolution?: string | null
          storage_path?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_asset_cache_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_cost_factors: {
        Row: {
          base_cost: number
          complexity_multiplier: Json | null
          cost_per_mb: number
          cost_per_second: number
          created_at: string | null
          engine: string
          id: string
          is_active: boolean | null
          resolution_multiplier: Json | null
        }
        Insert: {
          base_cost: number
          complexity_multiplier?: Json | null
          cost_per_mb: number
          cost_per_second: number
          created_at?: string | null
          engine: string
          id?: string
          is_active?: boolean | null
          resolution_multiplier?: Json | null
        }
        Update: {
          base_cost?: number
          complexity_multiplier?: Json | null
          cost_per_mb?: number
          cost_per_second?: number
          created_at?: string | null
          engine?: string
          id?: string
          is_active?: boolean | null
          resolution_multiplier?: Json | null
        }
        Relationships: []
      }
      render_cost_history: {
        Row: {
          actual_cost: number | null
          complexity_score: number | null
          created_at: string | null
          duration_sec: number | null
          engine: string | null
          estimated_cost: number | null
          file_size_mb: number | null
          id: string
          render_id: string | null
          resolution: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          actual_cost?: number | null
          complexity_score?: number | null
          created_at?: string | null
          duration_sec?: number | null
          engine?: string | null
          estimated_cost?: number | null
          file_size_mb?: number | null
          id?: string
          render_id?: string | null
          resolution?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          actual_cost?: number | null
          complexity_score?: number | null
          created_at?: string | null
          duration_sec?: number | null
          engine?: string | null
          estimated_cost?: number | null
          file_size_mb?: number | null
          id?: string
          render_id?: string | null
          resolution?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_cost_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_queue: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          engine: string | null
          error_message: string | null
          estimated_cost: number
          estimated_duration_sec: number | null
          id: string
          max_retries: number | null
          output_url: string | null
          priority: number | null
          project_id: string | null
          render_data: Json | null
          render_id: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          engine?: string | null
          error_message?: string | null
          estimated_cost: number
          estimated_duration_sec?: number | null
          id?: string
          max_retries?: number | null
          output_url?: string | null
          priority?: number | null
          project_id?: string | null
          render_data?: Json | null
          render_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          engine?: string | null
          error_message?: string | null
          estimated_cost?: number
          estimated_duration_sec?: number | null
          id?: string
          max_retries?: number | null
          output_url?: string | null
          priority?: number | null
          project_id?: string | null
          render_data?: Json | null
          render_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_queue_stats: {
        Row: {
          avg_duration_sec: number | null
          completed_jobs: number | null
          created_at: string | null
          date: string
          engine: string
          failed_jobs: number | null
          id: string
          peak_queue_size: number | null
          total_credits_used: number | null
          total_jobs: number | null
        }
        Insert: {
          avg_duration_sec?: number | null
          completed_jobs?: number | null
          created_at?: string | null
          date: string
          engine: string
          failed_jobs?: number | null
          id?: string
          peak_queue_size?: number | null
          total_credits_used?: number | null
          total_jobs?: number | null
        }
        Update: {
          avg_duration_sec?: number | null
          completed_jobs?: number | null
          created_at?: string | null
          date?: string
          engine?: string
          failed_jobs?: number | null
          id?: string
          peak_queue_size?: number | null
          total_credits_used?: number | null
          total_jobs?: number | null
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
      schedule_blocks: {
        Row: {
          caption_override: string | null
          content_id: string | null
          created_at: string | null
          end_at: string
          id: string
          meta: Json | null
          platform: string
          position: number | null
          start_at: string
          status: string
          title_override: string | null
          updated_at: string | null
          weekplan_id: string
          workspace_id: string
        }
        Insert: {
          caption_override?: string | null
          content_id?: string | null
          created_at?: string | null
          end_at: string
          id?: string
          meta?: Json | null
          platform: string
          position?: number | null
          start_at: string
          status?: string
          title_override?: string | null
          updated_at?: string | null
          weekplan_id: string
          workspace_id: string
        }
        Update: {
          caption_override?: string | null
          content_id?: string | null
          created_at?: string | null
          end_at?: string
          id?: string
          meta?: Json | null
          platform?: string
          position?: number | null
          start_at?: string
          status?: string
          title_override?: string | null
          updated_at?: string | null
          weekplan_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_weekplan_id_fkey"
            columns: ["weekplan_id"]
            isOneToOne: false
            referencedRelation: "weekplans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_publications: {
        Row: {
          caption: string | null
          created_at: string | null
          description: string | null
          error_message: string | null
          event_id: string | null
          hashtags: string[] | null
          id: string
          platform: string
          publish_at: string
          result_data: Json | null
          retry_count: number | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          video_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          event_id?: string | null
          hashtags?: string[] | null
          id?: string
          platform: string
          publish_at: string
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          video_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          event_id?: string | null
          hashtags?: string[] | null
          id?: string
          platform?: string
          publish_at?: string
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
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
          account_metadata: Json | null
          account_name: string
          auto_sync_enabled: boolean | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          provider: string
          provider_open_id: string | null
          refresh_token_hash: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_hash?: string | null
          account_id: string
          account_metadata?: Json | null
          account_name: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          provider_open_id?: string | null
          refresh_token_hash?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_hash?: string | null
          account_id?: string
          account_metadata?: Json | null
          account_name?: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          provider_open_id?: string | null
          refresh_token_hash?: string | null
          scope?: string | null
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
      social_media_publications: {
        Row: {
          caption: string | null
          created_at: string | null
          engagement_metrics: Json | null
          event_id: string | null
          external_id: string | null
          hashtags: string[] | null
          id: string
          metadata: Json | null
          platform: string
          post_url: string | null
          published_at: string | null
          scheduled_publication_id: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          engagement_metrics?: Json | null
          event_id?: string | null
          external_id?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json | null
          platform: string
          post_url?: string | null
          published_at?: string | null
          scheduled_publication_id?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          engagement_metrics?: Json | null
          event_id?: string | null
          external_id?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json | null
          platform?: string
          post_url?: string | null
          published_at?: string | null
          scheduled_publication_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_publications_scheduled_publication_id_fkey"
            columns: ["scheduled_publication_id"]
            isOneToOne: false
            referencedRelation: "scheduled_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          id: string
          like_count: number | null
          provider: string
          synced_at: string | null
          updated_at: string | null
          user_id: string
          username: string | null
          video_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          like_count?: number | null
          provider: string
          synced_at?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
          video_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          like_count?: number | null
          provider?: string
          synced_at?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
          video_count?: number | null
        }
        Relationships: []
      }
      storage_files: {
        Row: {
          bucket_name: string
          created_at: string
          file_path: string
          file_size_mb: number
          file_type: string | null
          id: string
          is_orphaned: boolean | null
          last_accessed_at: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          bucket_name: string
          created_at?: string
          file_path: string
          file_size_mb?: number
          file_type?: string | null
          id?: string
          is_orphaned?: boolean | null
          last_accessed_at?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          bucket_name?: string
          created_at?: string
          file_path?: string
          file_size_mb?: number
          file_type?: string | null
          id?: string
          is_orphaned?: boolean | null
          last_accessed_at?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
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
      template_ab_tests: {
        Row: {
          confidence_level: number | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string
          status: string
          template_a_id: string
          template_b_id: string
          traffic_split_a: number
          traffic_split_b: number
          updated_at: string
          winner_template_id: string | null
        }
        Insert: {
          confidence_level?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date: string
          status?: string
          template_a_id: string
          template_b_id: string
          traffic_split_a?: number
          traffic_split_b?: number
          updated_at?: string
          winner_template_id?: string | null
        }
        Update: {
          confidence_level?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          template_a_id?: string
          template_b_id?: string
          traffic_split_a?: number
          traffic_split_b?: number
          updated_at?: string
          winner_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_ab_tests_template_a_id_fkey"
            columns: ["template_a_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_ab_tests_template_b_id_fkey"
            columns: ["template_b_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_ab_tests_winner_template_id_fkey"
            columns: ["winner_template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_activity: {
        Row: {
          action: string
          changes_json: Json | null
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          action: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          action?: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_activity_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_approvals: {
        Row: {
          approver_id: string | null
          comment: string | null
          id: string
          reviewed_at: string | null
          status: string
          submitted_at: string
          submitted_by: string
          template_id: string
          version_id: string | null
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          template_id: string
          version_id?: string | null
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          template_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_approvals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "video_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          parent_comment_id: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "template_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_comments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_conversion_events: {
        Row: {
          created_at: string | null
          created_at_timestamp: string
          id: string
          platform: string[] | null
          published_at: string | null
          selected_at: string | null
          session_id: string
          source: string | null
          template_id: string
          time_to_create: number | null
          time_to_publish: number | null
          time_to_select: number | null
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_at_timestamp?: string
          id?: string
          platform?: string[] | null
          published_at?: string | null
          selected_at?: string | null
          session_id: string
          source?: string | null
          template_id: string
          time_to_create?: number | null
          time_to_publish?: number | null
          time_to_select?: number | null
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_at_timestamp?: string
          id?: string
          platform?: string[] | null
          published_at?: string | null
          selected_at?: string | null
          session_id?: string
          source?: string | null
          template_id?: string
          time_to_create?: number | null
          time_to_publish?: number | null
          time_to_select?: number | null
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_conversion_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_editing_sessions: {
        Row: {
          id: string
          is_active: boolean
          last_activity: string
          started_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          last_activity?: string
          started_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          last_activity?: string
          started_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_editing_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_mappings: {
        Row: {
          created_at: string | null
          field_key: string
          id: string
          remotion_prop_name: string
          template_id: string
          transformation_function: string | null
        }
        Insert: {
          created_at?: string | null
          field_key: string
          id?: string
          remotion_prop_name: string
          template_id: string
          transformation_function?: string | null
        }
        Update: {
          created_at?: string | null
          field_key?: string
          id?: string
          remotion_prop_name?: string
          template_id?: string
          transformation_function?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_performance_metrics: {
        Row: {
          avg_rating_in_period: number | null
          avg_view_duration_seconds: number | null
          conversion_to_create: number | null
          conversion_to_publish: number | null
          created_at: string
          date: string
          hour: number | null
          id: string
          projects_created: number
          projects_published: number
          ratings_submitted: number
          selection_rate: number | null
          template_id: string
          total_selections: number
          total_views: number
          unique_viewers: number
          updated_at: string
        }
        Insert: {
          avg_rating_in_period?: number | null
          avg_view_duration_seconds?: number | null
          conversion_to_create?: number | null
          conversion_to_publish?: number | null
          created_at?: string
          date: string
          hour?: number | null
          id?: string
          projects_created?: number
          projects_published?: number
          ratings_submitted?: number
          selection_rate?: number | null
          template_id: string
          total_selections?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
        }
        Update: {
          avg_rating_in_period?: number | null
          avg_view_duration_seconds?: number | null
          conversion_to_create?: number | null
          conversion_to_publish?: number | null
          created_at?: string
          date?: string
          hour?: number | null
          id?: string
          projects_created?: number
          projects_published?: number
          ratings_submitted?: number
          selection_rate?: number | null
          template_id?: string
          total_selections?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_performance_metrics_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_ratings: {
        Row: {
          created_at: string | null
          id: string
          rating: number
          review_text: string | null
          template_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          rating: number
          review_text?: string | null
          template_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          rating?: number
          review_text?: string | null
          template_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_views: {
        Row: {
          id: string
          session_id: string | null
          template_id: string
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          template_id: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          template_id?: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_views_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_sync_logs: {
        Row: {
          error_details: Json | null
          id: number
          message: string | null
          status: string
          synced_at: string
          user_id: string
          videos_synced: number | null
        }
        Insert: {
          error_details?: Json | null
          id?: number
          message?: string | null
          status: string
          synced_at?: string
          user_id: string
          videos_synced?: number | null
        }
        Update: {
          error_details?: Json | null
          id?: number
          message?: string | null
          status?: string
          synced_at?: string
          user_id?: string
          videos_synced?: number | null
        }
        Relationships: []
      }
      tiktok_uploads: {
        Row: {
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: number
          status: string
          thumbnail_url: string | null
          tiktok_share_url: string | null
          tiktok_video_id: string | null
          uploaded_at: string
          user_id: string
          video_description: string | null
          video_title: string
        }
        Insert: {
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: number
          status?: string
          thumbnail_url?: string | null
          tiktok_share_url?: string | null
          tiktok_video_id?: string | null
          uploaded_at?: string
          user_id: string
          video_description?: string | null
          video_title: string
        }
        Update: {
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: number
          status?: string
          thumbnail_url?: string | null
          tiktok_share_url?: string | null
          tiktok_video_id?: string | null
          uploaded_at?: string
          user_id?: string
          video_description?: string | null
          video_title?: string
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
      universal_audio_assets: {
        Row: {
          bpm: number | null
          created_at: string | null
          duration_sec: number | null
          genre: string | null
          id: string
          mood: string | null
          source: string | null
          stock_id: string | null
          stock_provider: string | null
          storage_path: string | null
          thumbnail_url: string | null
          title: string | null
          type: string
          updated_at: string | null
          url: string | null
          user_id: string
          waveform_data: Json | null
        }
        Insert: {
          bpm?: number | null
          created_at?: string | null
          duration_sec?: number | null
          genre?: string | null
          id?: string
          mood?: string | null
          source?: string | null
          stock_id?: string | null
          stock_provider?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          url?: string | null
          user_id: string
          waveform_data?: Json | null
        }
        Update: {
          bpm?: number | null
          created_at?: string | null
          duration_sec?: number | null
          genre?: string | null
          id?: string
          mood?: string | null
          source?: string | null
          stock_id?: string | null
          stock_provider?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
          waveform_data?: Json | null
        }
        Relationships: []
      }
      universal_background_assets: {
        Row: {
          color: string | null
          created_at: string | null
          duration_sec: number | null
          gradient_colors: Json | null
          id: string
          source: string | null
          storage_path: string | null
          thumbnail_url: string | null
          title: string | null
          type: string
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          duration_sec?: number | null
          gradient_colors?: Json | null
          id?: string
          source?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          duration_sec?: number | null
          gradient_colors?: Json | null
          id?: string
          source?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          url?: string | null
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
      user_behavior_events: {
        Row: {
          content_type: string | null
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_behavior_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capacity: {
        Row: {
          available_minutes: number
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          week_start: string
          workspace_id: string
        }
        Insert: {
          available_minutes?: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          week_start: string
          workspace_id: string
        }
        Update: {
          available_minutes?: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capacity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credit_transactions: {
        Row: {
          amount: number
          created_at: string | null
          feature_code: string | null
          id: string
          metadata: Json | null
          reservation_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          feature_code?: string | null
          id?: string
          metadata?: Json | null
          reservation_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          feature_code?: string | null
          id?: string
          metadata?: Json | null
          reservation_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credit_transactions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "credit_reservations"
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
      user_storage: {
        Row: {
          quota_mb: number
          updated_at: string | null
          used_mb: number
          user_id: string
        }
        Insert: {
          quota_mb?: number
          updated_at?: string | null
          used_mb?: number
          user_id: string
        }
        Update: {
          quota_mb?: number
          updated_at?: string | null
          used_mb?: number
          user_id?: string
        }
        Relationships: []
      }
      user_storage_quotas: {
        Row: {
          created_at: string
          last_calculated_at: string | null
          plan_tier: string
          quota_mb: number
          updated_at: string
          used_mb: number
          user_id: string
        }
        Insert: {
          created_at?: string
          last_calculated_at?: string | null
          plan_tier?: string
          quota_mb?: number
          updated_at?: string
          used_mb?: number
          user_id: string
        }
        Update: {
          created_at?: string
          last_calculated_at?: string | null
          plan_tier?: string
          quota_mb?: number
          updated_at?: string
          used_mb?: number
          user_id?: string
        }
        Relationships: []
      }
      video_analytics: {
        Row: {
          created_at: string
          creation_id: string
          ctr: number | null
          engagement_rate: number | null
          id: string
          updated_at: string
          user_id: string
          views: number | null
          watch_time: number | null
        }
        Insert: {
          created_at?: string
          creation_id: string
          ctr?: number | null
          engagement_rate?: number | null
          id?: string
          updated_at?: string
          user_id: string
          views?: number | null
          watch_time?: number | null
        }
        Update: {
          created_at?: string
          creation_id?: string
          ctr?: number | null
          engagement_rate?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          views?: number | null
          watch_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_analytics_creation_id_fkey"
            columns: ["creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_creations: {
        Row: {
          aspect_ratio: string | null
          brand_kit_id: string | null
          compressed_file_size_mb: number | null
          compression_ratio: number | null
          compression_settings: Json | null
          created_at: string | null
          credits_used: number | null
          custom_thumbnail_uploaded: boolean | null
          customizations: Json | null
          download_count: number | null
          error_message: string | null
          file_size: number | null
          format: string | null
          framerate: number | null
          id: string
          last_error_message: string | null
          max_retries: number | null
          media_assets: Json | null
          metadata: Json | null
          original_file_size_mb: number | null
          output_url: string | null
          parent_video_id: string | null
          progress_percentage: number | null
          progress_stage: string | null
          quality: string | null
          render_id: string | null
          retry_count: number | null
          share_count: number | null
          stage_details: Json | null
          status: string | null
          template_id: string | null
          thumbnail_timestamp_sec: number | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          version_number: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          brand_kit_id?: string | null
          compressed_file_size_mb?: number | null
          compression_ratio?: number | null
          compression_settings?: Json | null
          created_at?: string | null
          credits_used?: number | null
          custom_thumbnail_uploaded?: boolean | null
          customizations?: Json | null
          download_count?: number | null
          error_message?: string | null
          file_size?: number | null
          format?: string | null
          framerate?: number | null
          id?: string
          last_error_message?: string | null
          max_retries?: number | null
          media_assets?: Json | null
          metadata?: Json | null
          original_file_size_mb?: number | null
          output_url?: string | null
          parent_video_id?: string | null
          progress_percentage?: number | null
          progress_stage?: string | null
          quality?: string | null
          render_id?: string | null
          retry_count?: number | null
          share_count?: number | null
          stage_details?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_timestamp_sec?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          version_number?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          brand_kit_id?: string | null
          compressed_file_size_mb?: number | null
          compression_ratio?: number | null
          compression_settings?: Json | null
          created_at?: string | null
          credits_used?: number | null
          custom_thumbnail_uploaded?: boolean | null
          customizations?: Json | null
          download_count?: number | null
          error_message?: string | null
          file_size?: number | null
          format?: string | null
          framerate?: number | null
          id?: string
          last_error_message?: string | null
          max_retries?: number | null
          media_assets?: Json | null
          metadata?: Json | null
          original_file_size_mb?: number | null
          output_url?: string | null
          parent_video_id?: string | null
          progress_percentage?: number | null
          progress_stage?: string | null
          quality?: string | null
          render_id?: string | null
          retry_count?: number | null
          share_count?: number | null
          stage_details?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_timestamp_sec?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_creations_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_creations_parent_video_id_fkey"
            columns: ["parent_video_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_creations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      video_quality_presets: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          estimated_quality_score: number | null
          id: string
          is_default: boolean | null
          is_global: boolean | null
          name: string
          target_file_size_mb: number | null
          user_id: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          description?: string | null
          estimated_quality_score?: number | null
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name: string
          target_file_size_mb?: number | null
          user_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          estimated_quality_score?: number | null
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name?: string
          target_file_size_mb?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      video_renders: {
        Row: {
          completed_at: string | null
          content_config: Json
          created_at: string | null
          error_message: string | null
          format_config: Json
          id: string
          project_id: string
          render_id: string
          started_at: string | null
          status: string
          subtitle_config: Json
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          completed_at?: string | null
          content_config: Json
          created_at?: string | null
          error_message?: string | null
          format_config: Json
          id?: string
          project_id: string
          render_id: string
          started_at?: string | null
          status?: string
          subtitle_config: Json
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          completed_at?: string | null
          content_config?: Json
          created_at?: string | null
          error_message?: string | null
          format_config?: Json
          id?: string
          project_id?: string
          render_id?: string
          started_at?: string | null
          status?: string
          subtitle_config?: Json
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      video_shares: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          share_url: string | null
          user_id: string
          video_creation_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          share_url?: string | null
          user_id: string
          video_creation_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          share_url?: string | null
          user_id?: string
          video_creation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_shares_video_creation_id_fkey"
            columns: ["video_creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_template_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: string | null
          customizable_fields: Json
          description: string | null
          id: string
          is_published: boolean | null
          name: string
          shotstack_template: Json
          template_id: string
          thumbnail_url: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json
          description?: string | null
          id?: string
          is_published?: boolean | null
          name: string
          shotstack_template: Json
          template_id: string
          thumbnail_url?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json
          description?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          shotstack_template?: Json
          template_id?: string
          thumbnail_url?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      video_templates: {
        Row: {
          aspect_ratio: string
          available_transitions: string[] | null
          category: string
          created_at: string | null
          current_version: number | null
          customizable_fields: Json
          default_transition_style: string | null
          description: string | null
          duration: number
          has_audio: boolean | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          max_image_count: number | null
          max_video_count: number | null
          name: string
          platforms: string[] | null
          preview_url: string | null
          preview_video_url: string | null
          supports_multiple_images: boolean | null
          supports_multiple_videos: boolean | null
          supports_video: boolean | null
          tags: string[] | null
          template_config: Json
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          aspect_ratio: string
          available_transitions?: string[] | null
          category: string
          created_at?: string | null
          current_version?: number | null
          customizable_fields?: Json
          default_transition_style?: string | null
          description?: string | null
          duration: number
          has_audio?: boolean | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          max_image_count?: number | null
          max_video_count?: number | null
          name: string
          platforms?: string[] | null
          preview_url?: string | null
          preview_video_url?: string | null
          supports_multiple_images?: boolean | null
          supports_multiple_videos?: boolean | null
          supports_video?: boolean | null
          tags?: string[] | null
          template_config: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          aspect_ratio?: string
          available_transitions?: string[] | null
          category?: string
          created_at?: string | null
          current_version?: number | null
          customizable_fields?: Json
          default_transition_style?: string | null
          description?: string | null
          duration?: number
          has_audio?: boolean | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          max_image_count?: number | null
          max_video_count?: number | null
          name?: string
          platforms?: string[] | null
          preview_url?: string | null
          preview_video_url?: string | null
          supports_multiple_images?: boolean | null
          supports_multiple_videos?: boolean | null
          supports_video?: boolean | null
          tags?: string[] | null
          template_config?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      video_variants: {
        Row: {
          aspect_ratio: string | null
          created_at: string | null
          duration_sec: number | null
          file_size_mb: number | null
          file_url: string
          format: string | null
          id: string
          resolution: string | null
          updated_at: string | null
          variant_type: string
          video_creation_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          file_url: string
          format?: string | null
          id?: string
          resolution?: string | null
          updated_at?: string | null
          variant_type: string
          video_creation_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          file_url?: string
          format?: string | null
          id?: string
          resolution?: string | null
          updated_at?: string | null
          variant_type?: string
          video_creation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_variants_video_creation_id_fkey"
            columns: ["video_creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_translations: {
        Row: {
          created_at: string | null
          duration_sec: number | null
          id: string
          original_language: string
          original_text: string
          target_language: string
          translated_text: string
          user_id: string
          voice_id: string | null
          voiceover_url: string | null
        }
        Insert: {
          created_at?: string | null
          duration_sec?: number | null
          id?: string
          original_language: string
          original_text: string
          target_language: string
          translated_text: string
          user_id: string
          voice_id?: string | null
          voiceover_url?: string | null
        }
        Update: {
          created_at?: string | null
          duration_sec?: number | null
          id?: string
          original_language?: string
          original_text?: string
          target_language?: string
          translated_text?: string
          user_id?: string
          voice_id?: string | null
          voiceover_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_translations_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "custom_voices"
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
      wallets: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          last_reset_at: string | null
          monthly_credits: number
          plan_code: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          monthly_credits?: number
          plan_code?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          monthly_credits?: number
          plan_code?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      weekplans: {
        Row: {
          created_at: string | null
          created_by: string | null
          default_platforms: Json | null
          id: string
          name: string
          start_date: string
          status: string
          timezone: string
          updated_at: string | null
          weeks: number
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          default_platforms?: Json | null
          id?: string
          name: string
          start_date: string
          status?: string
          timezone?: string
          updated_at?: string | null
          weeks: number
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          default_platforms?: Json | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          timezone?: string
          updated_at?: string | null
          weeks?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekplans_workspace_id_fkey"
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
            foreignKeyName: "fk_workspace_members_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      workspace_subscriptions: {
        Row: {
          additional_seats: number | null
          base_seats: number | null
          created_at: string | null
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          total_amount: number
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          additional_seats?: number | null
          base_seats?: number | null
          created_at?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          total_amount: number
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          additional_seats?: number | null
          base_seats?: number | null
          created_at?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          total_amount?: number
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
          is_enterprise: boolean | null
          max_members: number | null
          member_currency: string | null
          member_seat_price: number | null
          name: string
          owner_id: string
          owner_user_id: string | null
          settings_json: Json | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_enterprise?: boolean | null
          max_members?: number | null
          member_currency?: string | null
          member_seat_price?: number | null
          name: string
          owner_id: string
          owner_user_id?: string | null
          settings_json?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_enterprise?: boolean | null
          max_members?: number | null
          member_currency?: string | null
          member_seat_price?: number | null
          name?: string
          owner_id?: string
          owner_user_id?: string | null
          settings_json?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_active_publishes: {
        Row: {
          active_count: number | null
          oldest_started: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_avg_duration: {
        Row: {
          avg_duration_ms: number | null
          provider: string | null
          total_count: number | null
        }
        Relationships: []
      }
      v_cron_summary: {
        Row: {
          avg_duration_ms: number | null
          error_runs: number | null
          hour: string | null
          success_runs: number | null
          total_runs: number | null
        }
        Relationships: []
      }
      v_metrics_summary: {
        Row: {
          avg_engagement: number | null
          comments: number | null
          day: string | null
          impressions: number | null
          likes: number | null
          provider: string | null
          shares: number | null
          views: number | null
        }
        Relationships: []
      }
      v_quota_usage: {
        Row: {
          quota_mb: number | null
          usage_percent: number | null
          used_mb: number | null
          user_id: string | null
        }
        Insert: {
          quota_mb?: number | null
          usage_percent?: never
          used_mb?: number | null
          user_id?: string | null
        }
        Update: {
          quota_mb?: number | null
          usage_percent?: never
          used_mb?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_success_rate: {
        Row: {
          error_count: number | null
          provider: string | null
          success_count: number | null
          success_ratio: number | null
          total_count: number | null
        }
        Relationships: []
      }
      v_top_posts: {
        Row: {
          caption_text: string | null
          comments: number | null
          engagement_rate: number | null
          external_id: string | null
          likes: number | null
          permalink: string | null
          posted_at: string | null
          provider: string | null
          shares: number | null
          user_id: string | null
          views: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_ai_video_credits: {
        Args: {
          p_base_amount: number
          p_bonus_amount: number
          p_bonus_percent: number
          p_currency: string
          p_pack_size: string
          p_stripe_session_id: string
          p_user_id: string
        }
        Returns: number
      }
      calculate_template_conversion_rates: {
        Args: { p_date_from: string; p_date_to: string; p_template_id: string }
        Returns: {
          create_rate: number
          publish_rate: number
          selection_rate: number
          total_creates: number
          total_publishes: number
          total_selections: number
          total_views: number
        }[]
      }
      calculate_test_significance: {
        Args: { test_id_param: string }
        Returns: {
          better_variant: string
          is_significant: boolean
          metric_name: string
          p_value: number
          variant_a_id: string
          variant_b_id: string
        }[]
      }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      cleanup_inactive_sessions: { Args: never; Returns: undefined }
      cleanup_old_active_publishes: { Args: never; Returns: undefined }
      cleanup_old_ai_jobs: { Args: never; Returns: undefined }
      cleanup_old_alerts: { Args: never; Returns: undefined }
      cleanup_old_rate_limit_states: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_stale_active_jobs: { Args: never; Returns: undefined }
      compute_content_hash: {
        Args: {
          p_caption: string
          p_media_urls: string[]
          p_platforms: string[]
        }
        Returns: string
      }
      deduct_ai_video_credits: {
        Args: { p_amount: number; p_generation_id: string; p_user_id: string }
        Returns: number
      }
      deduct_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: {
          new_balance: number
          success: boolean
        }[]
      }
      get_template_performance_summary: {
        Args: { p_days?: number; p_template_id: string }
        Returns: {
          avg_rating: number
          conversion_rate: number
          publish_rate: number
          selection_rate: number
          template_id: string
          total_projects: number
          total_publishes: number
          total_ratings: number
          total_selections: number
          total_views: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
              _workspace_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
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
      increment_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
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
      increment_template_usage: {
        Args: { template_id: string }
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
      is_workspace_member_func: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      refund_ai_video_credits: {
        Args: {
          p_amount_euros: number
          p_generation_id: string
          p_user_id: string
        }
        Returns: number
      }
      reset_monthly_credits: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_owns_comment: { Args: { _comment_id: string }; Returns: boolean }
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
        | "edge_fn.call"
        | "edge_fn.error"
        | "edge_fn.timeout"
      app_role: "owner" | "admin" | "editor" | "viewer"
      approval_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "published"
      calendar_event_status:
        | "briefing"
        | "in_progress"
        | "review"
        | "pending_approval"
        | "approved"
        | "scheduled"
        | "published"
        | "cancelled"
        | "failed"
        | "queued"
      calendar_role:
        | "owner"
        | "account_manager"
        | "editor"
        | "approver"
        | "viewer"
      calendar_view_type: "month" | "week" | "list" | "kanban" | "timeline"
      goal_status: "active" | "completed" | "paused" | "failed"
      goal_type:
        | "followers"
        | "posts_per_month"
        | "engagement_rate"
        | "content_created"
        | "revenue"
      ig_media_type: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      notification_type: "low_balance" | "paused" | "threshold_hit"
      post_status: "draft" | "scheduled" | "posted"
      remotion_component_type:
        | "ProductAd"
        | "InstagramStory"
        | "TikTokReel"
        | "Testimonial"
        | "Tutorial"
        | "UniversalVideo"
      subscription_status: "active" | "paused" | "canceled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "review" | "done"
      team_role: "owner" | "admin" | "editor" | "viewer"
      template_category:
        | "social_media"
        | "advertising"
        | "explainer"
        | "tutorial"
        | "testimonial"
        | "product_showcase"
        | "event"
        | "educational"
        | "entertainment"
        | "other"
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
        "edge_fn.call",
        "edge_fn.error",
        "edge_fn.timeout",
      ],
      app_role: ["owner", "admin", "editor", "viewer"],
      approval_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "published",
      ],
      calendar_event_status: [
        "briefing",
        "in_progress",
        "review",
        "pending_approval",
        "approved",
        "scheduled",
        "published",
        "cancelled",
        "failed",
        "queued",
      ],
      calendar_role: [
        "owner",
        "account_manager",
        "editor",
        "approver",
        "viewer",
      ],
      calendar_view_type: ["month", "week", "list", "kanban", "timeline"],
      goal_status: ["active", "completed", "paused", "failed"],
      goal_type: [
        "followers",
        "posts_per_month",
        "engagement_rate",
        "content_created",
        "revenue",
      ],
      ig_media_type: ["IMAGE", "VIDEO", "REEL", "CAROUSEL_ALBUM"],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      notification_type: ["low_balance", "paused", "threshold_hit"],
      post_status: ["draft", "scheduled", "posted"],
      remotion_component_type: [
        "ProductAd",
        "InstagramStory",
        "TikTokReel",
        "Testimonial",
        "Tutorial",
        "UniversalVideo",
      ],
      subscription_status: ["active", "paused", "canceled"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "review", "done"],
      team_role: ["owner", "admin", "editor", "viewer"],
      template_category: [
        "social_media",
        "advertising",
        "explainer",
        "tutorial",
        "testimonial",
        "product_showcase",
        "event",
        "educational",
        "entertainment",
        "other",
      ],
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
