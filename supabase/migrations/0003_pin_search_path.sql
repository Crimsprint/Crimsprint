-- Supabase advisor 0011: pin search_path on the pure helpers (they only use built-ins).
alter function public.p_correct(float8, float8) set search_path = '';
alter function public.tier_b(text) set search_path = '';
alter function public.spr_correct(text, jsonb) set search_path = '';
alter function public.quest_pool() set search_path = '';
alter function public.mock_limit(int) set search_path = '';
alter function public.week_start(timestamptz) set search_path = '';
