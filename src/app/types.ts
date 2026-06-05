export type EnvBindings = {
  DB: D1Database;
  APP_NAME?: string;
  MAX_CONFIG_BYTES?: string;
  MAX_EXPORT_REQUEST_BYTES?: string;
};

export type ClientAppIdentity = {
  appId: string;
};

export type AppVariables = {
  requestId: string;
  clientApp?: ClientAppIdentity;
};

export type AppEnv = {
  Bindings: EnvBindings;
  Variables: AppVariables;
};
