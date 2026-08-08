export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;

  JWT_SECRET: string;
  JWT_ACCESS_TTL?: string;
  JWT_REFRESH_TTL?: string;
  COOKIE_DOMAIN?: string;
  ALLOWED_ORIGINS?: string;
  ADMIN_SIGNUP_KEY?: string;
  ENVIRONMENT?: string;
  R2_PUBLIC_URL?: string;

  EMAIL_FROM?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;

  SMS_PROVIDER?: string;
  SMS_API_KEY?: string;
  SMS_SENDER_ID?: string;

  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_ID?: string;
  ADMIN_WHATSAPP?: string;
}

export interface UserPayload {
  sub: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "STAFF";
  [key: string]: unknown;
}

export type Variables = {
  userId?: string;
  userRole?: "CUSTOMER" | "ADMIN" | "STAFF";
  userEmail?: string;
};

export type AppEnv = { Bindings: Env; Variables: Variables };
