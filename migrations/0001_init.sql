create table if not exists configs (
  id text primary key,
  content_json text not null,
  content_hash text not null,
  content_size integer not null,
  created_at text not null default current_timestamp
);

create table if not exists config_shares (
  id text primary key,
  config_id text not null,
  short_code text not null unique,
  status text not null default 'active',
  expires_at text null,
  access_count integer not null default 0,
  created_at text not null default current_timestamp,
  foreign key (config_id) references configs(id) on delete cascade
);

create table if not exists client_apps (
  app_id text primary key,
  app_name text not null,
  api_key_hash text not null unique,
  status text not null default 'active',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists audit_logs (
  id text primary key,
  app_id text null,
  action text not null,
  request_id text not null,
  ip text not null,
  resource_type text not null,
  resource_id text null,
  metadata_json text not null default '{}',
  created_at text not null default current_timestamp
);

create index if not exists idx_config_shares_config_id on config_shares(config_id);
create index if not exists idx_config_shares_status on config_shares(status);
create index if not exists idx_client_apps_status on client_apps(status);
create index if not exists idx_audit_logs_request_id on audit_logs(request_id);
