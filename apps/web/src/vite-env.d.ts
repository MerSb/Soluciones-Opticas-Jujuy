/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_VERCEL_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
