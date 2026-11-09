/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KC_PROXY_URL?: string;
  readonly VITE_DONATE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
