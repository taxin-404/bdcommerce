interface Env {
  /** Secret. When unset, admin login is disabled with a configuration error. */
  ADMIN_PASSPHRASE?: string;
  /** Optional Turnstile site key. Turnstile runs only when both keys are set. */
  TURNSTILE_SITE_KEY?: string;
  /** Optional Turnstile secret key. Turnstile runs only when both keys are set. */
  TURNSTILE_SECRET_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    /** Secret. When unset, admin login is disabled with a configuration error. */
    ADMIN_PASSPHRASE?: string;
    /** Optional Turnstile site key. Turnstile runs only when both keys are set. */
    TURNSTILE_SITE_KEY?: string;
    /** Optional Turnstile secret key. Turnstile runs only when both keys are set. */
    TURNSTILE_SECRET_KEY?: string;
  }
}

declare namespace App {
  interface Locals {
    admin?: import('./lib/auth').AdminSession;
  }
}
