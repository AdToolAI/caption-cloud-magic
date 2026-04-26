// Marketplace types — Templates, Purchases, Ratings, Earnings
import type { MotionStudioTemplate } from './motion-studio-templates';

export type MarketplaceStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'unlisted';
export type PricingType = 'free' | 'premium';

export interface MarketplaceTemplate extends MotionStudioTemplate {
  creator_user_id: string | null;
  marketplace_status: MarketplaceStatus;
  pricing_type: PricingType;
  price_credits: number;
  revenue_share_percent: number;
  total_revenue_credits: number;
  total_purchases: number;
  average_rating: number;
  total_ratings: number;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
}

export interface TemplatePurchase {
  id: string;
  template_id: string;
  buyer_user_id: string;
  creator_user_id: string | null;
  price_credits: number;
  creator_earned_credits: number;
  platform_fee_credits: number;
  pricing_type: PricingType;
  purchased_at: string;
  refunded_at: string | null;
}

export interface TemplateRating {
  id: string;
  template_id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorEarning {
  id: string;
  creator_user_id: string;
  template_id: string | null;
  purchase_id: string | null;
  credits_earned: number;
  created_at: string;
}

export interface PurchaseResult {
  ok: boolean;
  already_owned?: boolean;
  purchase_id?: string;
  price_credits?: number;
  creator_earned?: number;
  platform_fee?: number;
  error?: string;
  required?: number;
  balance?: number;
}
