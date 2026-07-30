alter table public.wolf_room_players
  drop constraint if exists wolf_room_players_avatar_key_check;

alter table public.wolf_room_players
  add constraint wolf_room_players_avatar_key_check
  check (
    avatar_key in (
      'avatar0',
      'img',
      'img_1',
      'img_2',
      'img_3',
      'img_4',
      'img_5',
      'img_6',
      'img_7',
      'img_8',
      'img_9',
      'img_10',
      'img_11',
      'img_12',
      'img_13',
      'img_14',
      'img_15',
      'img_16',
      'img_17',
      'img_18',
      'img_19',
      'khanh',
      'duong',
      'lan',
      'tri'
    )
  );
