-- Add extra Ma Soi roles used by configurable role setup.
ALTER TYPE public.wolf_role ADD VALUE IF NOT EXISTS 'werewolf_seer';
ALTER TYPE public.wolf_role ADD VALUE IF NOT EXISTS 'witch';
ALTER TYPE public.wolf_role ADD VALUE IF NOT EXISTS 'copycat';
