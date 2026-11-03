begin;

revoke references, trigger
on table public.chase_cards
from anon, authenticated;

commit;
