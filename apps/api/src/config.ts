import type { Env } from "./env";

// Centralised, environment-driven external integration config.
// Values come from settings DB rows (via lib/settings) or env vars.

export const WHATSAPP_TOKEN = (env: Env) => env.WHATSAPP_TOKEN || "";
export const WHATSAPP_PHONE_ID = (env: Env) => env.WHATSAPP_PHONE_ID || "";
export const ADMIN_WHATSAPP = (env: Env) => env.ADMIN_WHATSAPP || "";

export const EMAIL_FROM = (env: Env) => env.EMAIL_FROM || "noreply@localhost";
