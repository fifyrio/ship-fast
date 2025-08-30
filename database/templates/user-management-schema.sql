-- 用户管理系统 - 可复用数据库模板
-- 适用于需要用户认证、资料管理和会话跟踪的项目

-- 用户资料扩展表 (扩展 Supabase auth.users)
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  avatar_url text,
  plan_type text DEFAULT 'free'::text CHECK (plan_type = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text])),
  is_verified boolean DEFAULT false,
  language_preference text DEFAULT 'en'::text,
  timezone text DEFAULT 'UTC'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- 用户会话管理 (可选，用于 JWT token 管理)
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_token text NOT NULL UNIQUE,
  ip_address inet,
  user_agent text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- API 日志记录 (可选，用于监控和分析)
CREATE TABLE public.api_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  endpoint text NOT NULL,
  method text NOT NULL,
  request_body jsonb,
  response_status integer,
  response_time_ms integer,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_logs_pkey PRIMARY KEY (id),
  CONSTRAINT api_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 系统设置管理
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  setting_type text DEFAULT 'string'::text CHECK (setting_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'json'::text])),
  description text,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);

-- Row Level Security (RLS) 策略示例
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的资料
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 插入策略 (通常由触发器处理)
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 自动更新 updated_at 字段的触发器函数
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 应用触发器到用户资料表
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();