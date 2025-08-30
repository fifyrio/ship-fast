-- 订阅和支付系统 - 可复用数据库模板
-- 适用于需要订阅管理、支付处理的 SaaS 项目

-- 定价计划表
CREATE TABLE public.pricing_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_type text NOT NULL UNIQUE CHECK (plan_type = ANY (ARRAY['trial'::text, 'basic'::text, 'pro'::text, 'enterprise'::text])),
  name text NOT NULL,
  display_name text NOT NULL,
  current_price numeric NOT NULL,
  original_price numeric,
  currency text DEFAULT 'USD'::text,
  billing_cycle text DEFAULT 'monthly'::text CHECK (billing_cycle = ANY (ARRAY['one_time'::text, 'monthly'::text, 'yearly'::text])),
  -- 功能限制 (根据项目调整)
  feature_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  feature_highlights jsonb DEFAULT '[]'::jsonb,
  -- 展示配置
  button_text text,
  button_color text,
  is_popular boolean DEFAULT false,
  show_price_increase_warning boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT pricing_plans_pkey PRIMARY KEY (id)
);

-- 计划功能详情表
CREATE TABLE public.plan_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  feature_name text NOT NULL,
  feature_type text DEFAULT 'included'::text CHECK (feature_type = ANY (ARRAY['included'::text, 'excluded'::text, 'highlighted'::text])),
  icon text,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT plan_features_pkey PRIMARY KEY (id),
  CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.pricing_plans(id) ON DELETE CASCADE
);

-- 产品表 (灵活的产品定义)
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text NOT NULL UNIQUE,
  product_name text NOT NULL,
  price integer NOT NULL, -- 以分为单位存储
  original_price integer,
  currency text DEFAULT 'USD'::text,
  type text NOT NULL CHECK (type = ANY (ARRAY['one_time'::text, 'subscription'::text])),
  -- 产品属性 (根据项目调整)
  attributes jsonb DEFAULT '{}'::jsonb,
  features jsonb DEFAULT '[]'::jsonb,
  billing_period text CHECK (billing_period = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  -- 展示配置
  description text,
  button_text text,
  button_color text,
  is_popular boolean DEFAULT false,
  price_increase boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- 订单表
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  price integer NOT NULL, -- 以分为单位
  currency text DEFAULT 'USD'::text,
  type text NOT NULL CHECK (type = ANY (ARRAY['one_time'::text, 'subscription'::text])),
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'cancelled'::text, 'refunded'::text])),
  -- 支付网关信息
  checkout_id text UNIQUE,
  payment_method text,
  payment_provider text DEFAULT 'stripe'::text,
  -- 产品详情快照
  product_snapshot jsonb DEFAULT '{}'::jsonb,
  -- 时间戳
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id)
);

-- 订阅管理表
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- 支付网关集成
  external_subscription_id text UNIQUE, -- Stripe subscription ID 等
  external_customer_id text,
  -- 订阅信息
  plan_type text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['active'::text, 'canceled'::text, 'past_due'::text, 'unpaid'::text, 'trialing'::text])),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  -- 计费信息
  price integer, -- 以分为单位
  currency text DEFAULT 'USD'::text,
  billing_cycle text DEFAULT 'monthly'::text,
  -- 时间戳
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT subscriptions_plan_type_fkey FOREIGN KEY (plan_type) REFERENCES public.pricing_plans(plan_type)
);

-- 订阅使用统计表
CREATE TABLE public.subscription_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  billing_period_start timestamp with time zone NOT NULL,
  billing_period_end timestamp with time zone NOT NULL,
  -- 使用量统计 (根据项目调整)
  usage_quota jsonb DEFAULT '{}'::jsonb, -- 配额信息
  usage_current jsonb DEFAULT '{}'::jsonb, -- 当前使用量
  overage_charges numeric DEFAULT 0.00,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT subscription_usage_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT subscription_usage_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT subscription_usage_unique_period UNIQUE (subscription_id, billing_period_start)
);

-- Row Level Security 策略
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的订单
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能查看自己的订阅
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能查看自己的使用统计
CREATE POLICY "Users can view own usage stats" ON public.subscription_usage
  FOR SELECT USING (auth.uid() = user_id);

-- 索引优化
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_checkout_id ON public.orders(checkout_id);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_external_id ON public.subscriptions(external_subscription_id);

CREATE INDEX idx_subscription_usage_user_period ON public.subscription_usage(user_id, billing_period_start DESC);

-- 触发器：自动更新 updated_at 字段
CREATE TRIGGER update_pricing_plans_updated_at
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_subscription_usage_updated_at
  BEFORE UPDATE ON public.subscription_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();