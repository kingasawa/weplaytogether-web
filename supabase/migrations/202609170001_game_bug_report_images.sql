-- Add image attachments (max 3) to post-game bug reports.
-- Idempotent where possible because this project commonly applies migrations manually in Supabase SQL Editor.

alter table public.game_bug_reports
  add column if not exists image_urls text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_bug_reports_image_urls_max_3'
      and conrelid = 'public.game_bug_reports'::regclass
  ) then
    alter table public.game_bug_reports
      add constraint game_bug_reports_image_urls_max_3
      check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 3);
  end if;
end
$$;
