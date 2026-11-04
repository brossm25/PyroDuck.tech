begin;

create or replace function public.get_deck_owner_label(p_deck_id uuid)
returns table(username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.display_name
  from public.decks d
  join public.profiles p on p.id = d.user_id
  where d.id = p_deck_id
    and (
      d.visibility = 'public'
      or d.user_id = (select auth.uid())
      or (
        d.visibility = 'friends'
        and exists (
          select 1
          from public.friendships f
          where f.status = 'accepted'
            and (
              (
                f.requester_id = (select auth.uid())
                and f.recipient_id = d.user_id
              )
              or (
                f.recipient_id = (select auth.uid())
                and f.requester_id = d.user_id
              )
            )
        )
      )
    );
$$;

revoke all on function public.get_deck_owner_label(uuid)
from public, anon, authenticated;

grant execute on function public.get_deck_owner_label(uuid)
to anon, authenticated;

commit;
