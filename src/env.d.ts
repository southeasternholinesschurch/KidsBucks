/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
}

declare namespace App {
  interface Locals extends Runtime {
    /** The signed-in leader, re-read from the database on every request so a
     *  removed volunteer is locked out at once rather than when their cookie
     *  happens to expire. */
    leader?: { id: number; name: string; role: 'admin' | 'leader' };
    /** The child whose card was scanned. Read access to THEIR page only. */
    cardKid?: number | null;
  }
}
