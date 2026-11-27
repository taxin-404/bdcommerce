interface Env {
  /** Secret. When unset, admin login is disabled with a configuration error. */
  ADMIN_PASSPHRASE?: string;
}

declare namespace Cloudflare {
  interface Env {
    /** Secret. When unset, admin login is disabled with a configuration error. */
    ADMIN_PASSPHRASE?: string;
  }
}

declare namespace App {
  interface Locals {
    admin?: import('./lib/auth').AdminSession;
  }
}
