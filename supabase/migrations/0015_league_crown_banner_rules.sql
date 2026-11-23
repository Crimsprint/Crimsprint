-- Read the current rules alongside the existing leaderboard without changing its RPC contract.
begin;

create function public.get_league_v3_with_crown_rules() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  league jsonb := public.get_league_v3();
begin
  if league->>'opted_out' = 'true' then
    return league;
  end if;

  return league || jsonb_build_object('crown_rules', (
    select jsonb_build_object(
      'first_week', rules.first_week,
      'min_active_members', rules.min_active_members,
      'min_winner_points', rules.min_winner_points
    )
    from public.league_crown_rules rules
    where rules.singleton
  ));
end $$;

revoke execute on function public.get_league_v3_with_crown_rules() from public, anon, authenticated;
grant execute on function public.get_league_v3_with_crown_rules() to authenticated;

commit;
