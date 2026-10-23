-- Domain Master fired after one lesson because the diagnostic seeds every skill in a domain at the same mastery.
-- Now every skill in the domain must also have been practised (at least 8 answers) and be at 70%+.
create or replace function public.on_session_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dom text;
  firsts int;
  right_ int;
begin
  if not (old.status = 'active' and new.status = 'completed') then return new; end if;
  if new.mode in ('lesson', 'weak') then perform public.bump_quest(new.user_id, 'lessons2', 1); end if;
  if new.mode = 'diagnostic' then perform public.award(new.user_id, 'diagnosed'); end if;
  if new.mode = 'lesson' then
    perform public.award(new.user_id, 'first_step');
    select count(*) filter (where not is_reask), count(*) filter (where not is_reask and correct)
      into firsts, right_ from public.responses where session_id = new.id;
    if new.tier = 'hard' and firsts > 0 and right_ = firsts then perform public.award(new.user_id, 'sharpshooter'); end if;
    select domain_id into dom from public.skills where id = new.skill_id;
    if not exists (
      select 1 from public.skills k left join public.mastery m on m.skill_id = k.id and m.user_id = new.user_id
      where k.domain_id = dom and (coalesce(m.n, 0) < 8 or public.p_correct(coalesce(m.theta, 0), 0) < 0.7)
    ) then perform public.award(new.user_id, 'domain_master'); end if;
  end if;
  return new;
end $$;
revoke execute on function public.on_session_done() from public, anon, authenticated;
