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
    },
  },
} as const
