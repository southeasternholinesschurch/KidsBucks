import { defineMiddleware } from 'astro:middleware';
import { isSetUp, readLeader, readCardKid, forgetCard } from './lib/auth';

/**
 * Everything is private except getting in.
 *
 * Deny by default and name the exceptions — the opposite (listing what to
 * protect) means a page added later is public until somebody remembers.
 */
const PUBLIC = ['/enter', '/setup', '/c/', '/_astro/', '/favicon', '/logo'];
/** Only an admin may change the shape of the ministry. */
const ADMIN_ONLY = ['/manage'];

function harden(response: Response): Response {
  const res = new Response(response.body, response);
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('frame-ancestors', "'self'");
  // A list of children's names has no business in a search index.
  res.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const env = context.locals.runtime?.env as { DB: D1Database } | undefined;
  if (!env?.DB) return harden(new Response('Database not configured', { status: 500 }));

  // Nothing works until the first leader exists, including the pages that
  // check for one.
  if (!(await isSetUp(env))) {
    return pathname === '/setup'
      ? harden(await next())
      : harden(context.redirect('/setup', 302));
  }
  if (pathname === '/setup') return harden(context.redirect('/', 302));

  if (PUBLIC.some((p) => pathname.startsWith(p))) return harden(await next());

  const leader = await readLeader(env, context.cookies);
  /* A card only matters when nobody is signed in; a leader who scanned one is
   * still a leader. */
  const cardKid = leader ? null : await readCardKid(env, context.cookies);

  if (!leader && !cardKid) {
    const to = encodeURIComponent(pathname + context.url.search);
    return harden(context.redirect(`/enter?next=${to}`, 302));
  }

  /*
   * A CARD OPENS ONE PAGE.
   *
   * Enforced here rather than in the pages, for the same reason the leader
   * check is: a rule written once in front of everything cannot be forgotten
   * by a page added next year. A child holding a card sees their own page and
   * nothing else — not the roster, not another child, not the admin screens.
   */
  if (!leader && cardKid) {
    const mine = `/kid/${cardKid}`;
    if (pathname !== mine && pathname !== '/leave') {
      return harden(context.redirect(mine, 302));
    }
  }

  if (leader && leader.role !== 'admin' && ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    return harden(context.redirect('/?denied=admin', 302));
  }

  context.locals.leader = leader ?? undefined;
  context.locals.cardKid = cardKid;
  return harden(await next());
});
