/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KC_PROXY_URL?: string;
  /** Base URL of the 2lakes Worker API. Set to http://127.0.0.1:8787 for `wrangler dev`. */
  readonly VITE_API_BASE?: string;
  readonly VITE_DONATE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
