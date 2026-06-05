alter table configs add column app_id text not null default '';

drop table if exists _migration_config_canonical;
drop table if exists _migration_share_canonical;

create table _migration_config_canonical as
select
  c.id as config_id,
  coalesce(
    (
      select s.config_id
      from config_shares s
      join configs sc on sc.id = s.config_id
      where sc.app_id = c.app_id
        and sc.content_hash = c.content_hash
      order by s.created_at asc, s.id asc
      limit 1
    ),
    (
      select c2.id
      from configs c2
      where c2.app_id = c.app_id
        and c2.content_hash = c.content_hash
      order by c2.created_at asc, c2.id asc
      limit 1
    )
  ) as canonical_config_id
from configs c;

create table _migration_share_canonical as
select
  s.id as share_id,
  (
    select s2.id
    from config_shares s2
    left join _migration_config_canonical m2 on m2.config_id = s2.config_id
    where coalesce(m2.canonical_config_id, s2.config_id) = coalesce(m.canonical_config_id, s.config_id)
    order by s2.created_at asc, s2.id asc
    limit 1
  ) as canonical_share_id,
  coalesce(m.canonical_config_id, s.config_id) as canonical_config_id
from config_shares s
left join _migration_config_canonical m on m.config_id = s.config_id;

update config_shares
set config_id = (
  select canonical_config_id
  from _migration_share_canonical
  where share_id = config_shares.id
)
where id in (
  select canonical_share_id
  from _migration_share_canonical
);

delete from config_shares
where id in (
  select share_id
  from _migration_share_canonical
  where share_id <> canonical_share_id
);

delete from configs
where id in (
  select config_id
  from _migration_config_canonical
  where config_id <> canonical_config_id
);

drop table _migration_share_canonical;
drop table _migration_config_canonical;

create unique index if not exists idx_configs_app_hash_unique
on configs(app_id, content_hash);

create unique index if not exists idx_config_shares_config_id_unique
on config_shares(config_id);
