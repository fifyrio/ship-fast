-- 积分系统 - 可复用数据库模板
-- 适用于需要虚拟货币、积分管理的项目

-- 积分交易记录表
CREATE TABLE public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['purchase'::text, 'usage'::text, 'refund'::text, 'bonus'::text])),
  amount integer NOT NULL,
  description text,
  -- 关联对象ID (根据项目需要调整)
  related_object_id uuid, -- 可以是 video_id, order_id 等
  related_object_type text, -- 'video', 'order', 'subscription' 等
  -- 元数据
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT credit_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 签到奖励配置表
CREATE TABLE public.check_in_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  day_sequence integer NOT NULL UNIQUE CHECK (day_sequence >= 1 AND day_sequence <= 7),
  credits_reward integer NOT NULL,
  is_special_reward boolean DEFAULT false,
  reward_title text,
  reward_description text,
  icon text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT check_in_rewards_pkey PRIMARY KEY (id)
);

-- 用户签到记录表
CREATE TABLE public.user_check_ins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  check_in_date date NOT NULL,
  credits_earned integer NOT NULL DEFAULT 1,
  consecutive_days integer NOT NULL DEFAULT 1,
  is_bonus_reward boolean DEFAULT false,
  timezone text DEFAULT 'UTC'::text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT user_check_ins_pkey PRIMARY KEY (id),
  CONSTRAINT user_check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_check_ins_unique_daily UNIQUE (user_id, check_in_date)
);

-- 推荐码管理表
CREATE TABLE public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  referral_code text NOT NULL UNIQUE,
  referral_link text NOT NULL,
  total_referrals integer DEFAULT 0,
  successful_referrals integer DEFAULT 0,
  total_credits_earned integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT referral_codes_pkey PRIMARY KEY (id),
  CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 推荐记录表
CREATE TABLE public.user_referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid,
  referral_code text NOT NULL,
  referred_email text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'registered'::text, 'converted'::text, 'credited'::text])),
  credits_awarded integer DEFAULT 0,
  conversion_date timestamp with time zone,
  credited_date timestamp with time zone,
  -- 追踪信息
  ip_address inet,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT user_referrals_pkey PRIMARY KEY (id),
  CONSTRAINT user_referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id),
  CONSTRAINT user_referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES auth.users(id)
);

-- 推荐奖励配置表
CREATE TABLE public.referral_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reward_type text NOT NULL UNIQUE CHECK (reward_type = ANY (ARRAY['registration'::text, 'first_payment'::text, 'subscription'::text])),
  credits_reward integer NOT NULL,
  minimum_spending integer DEFAULT 0,
  reward_title text,
  reward_description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT referral_rewards_pkey PRIMARY KEY (id)
);

-- 用户免费积分统计表
CREATE TABLE public.user_free_credits_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  -- 签到统计
  total_check_ins integer DEFAULT 0,
  current_consecutive_days integer DEFAULT 0,
  longest_consecutive_days integer DEFAULT 0,
  last_check_in_date date,
  total_check_in_credits integer DEFAULT 0,
  -- 推荐统计
  total_referrals_sent integer DEFAULT 0,
  successful_referrals integer DEFAULT 0,
  pending_referrals integer DEFAULT 0,
  total_referral_credits integer DEFAULT 0,
  -- 总计
  total_free_credits_earned integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT user_free_credits_stats_pkey PRIMARY KEY (id),
  CONSTRAINT user_free_credits_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Row Level Security 策略
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_free_credits_stats ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的积分交易记录
CREATE POLICY "Users can view own credit transactions" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能查看自己的签到记录
CREATE POLICY "Users can view own check-ins" ON public.user_check_ins
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能管理自己的推荐码
CREATE POLICY "Users can manage own referral codes" ON public.referral_codes
  FOR ALL USING (auth.uid() = user_id);

-- 索引优化
CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX idx_credit_transactions_type ON public.credit_transactions(transaction_type);

CREATE INDEX idx_user_check_ins_user_date ON public.user_check_ins(user_id, check_in_date DESC);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(referral_code);
CREATE INDEX idx_user_referrals_referrer ON public.user_referrals(referrer_id);
CREATE INDEX idx_user_referrals_status ON public.user_referrals(status);