export type ContentType = 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  content_type: ContentType;
  category: string;
  platform: string;
  aspect_ratio: string;
  duration_min: number;
  duration_max: number;
  thumbnail_url: string | null;
  preview_video_url: string | null;
  template_config: Record<string, any>;
  customizable_fields: CustomizableField[];
  ai_features: string[];
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CustomizableField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'image' | 'video' | 'color' | 'number' | 'select';
  required: boolean;
  default_value?: any;
  placeholder?: string;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface ContentProject {
  id: string;
  user_id: string;
  template_id: string | null;
  content_type: ContentType;
  project_name: string;
  brief: string | null;
  customizations: Record<string, any>;
  export_formats: Record<string, boolean>;
  export_aspect_ratios: string[];
  status: 'draft' | 'rendering' | 'completed' | 'failed';
  render_engine: 'shotstack' | 'remotion';
  render_id: string | null;
  output_urls: Record<string, string>;
  credits_used: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  shared_with: string[];
  workspace_id: string | null;
}
