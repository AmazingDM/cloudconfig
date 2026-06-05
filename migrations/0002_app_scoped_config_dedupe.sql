alter table configs add column app_id text not null default '';

create unique index if not exists idx_configs_app_hash_unique
on configs(app_id, content_hash);

create unique index if not exists idx_config_shares_config_id_unique
on config_shares(config_id);
