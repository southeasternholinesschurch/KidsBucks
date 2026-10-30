# KidsBucks

A points system for a children's ministry of 150–200, built to run on
Cloudflare Workers and D1 for roughly nothing a month.

Leaders award points from their own phones. Children scan a printed card to
see their own total. Every entry records which leader made it.

Descended from a four-child family app, and deliberately not the same
program — see **Why this is not the family app** below.

## What it does

- **Classes, not one long list.** The front page is your classes; finding one
  child is a search or a card scan. Two hundred cards on a page is a wall, not
  a board.
- **Award a whole class at once.** "Everyone here gets 5 for turning up" is
  the commonest thing anybody does with a points system. One tap, and one tap
  to undo the whole thing if you picked the wrong class.
- **Leader accounts.** Tap your name, type your PIN. Every ledger entry says
  who made it, which is what makes "who gave Jayden fifty bucks" answerable.
- **Printed cards.** Make cards for a whole class, print them three to a row,
  cut them up. A child scans theirs and sees their own total and nothing else.
- **Roster import.** Paste a list — or a spreadsheet — and it creates the
  children and the classes in one go.
- **Standings.** Class totals and a top-25, for the competitive bit.

## How the money works

A **ledger, never a balance.** Every award is a row; a total is their sum.

Two leaders awarding the same child at the same moment both get counted — a
stored balance would lose one of them. And a child who says "I had more than
that" has to be answerable with a list rather than a number somebody typed.

**Undo writes an opposite row**, it never deletes. Both the mistake and the
fix stay visible, which is what lets you show a child why their total moved.

**Archive, never delete.** A ledger row points at `kid_id` with
`ON DELETE CASCADE`, so deleting a child would silently destroy years of their
history. There is no delete button for a child, a class or a leader anywhere
in the app, and that is the feature.

## Who can do what

| | Child with a card | Leader | Admin |
|---|---|---|---|
| See their own total | ✅ | ✅ | ✅ |
| See the roster, classes, standings | ❌ | ✅ | ✅ |
| Award and take away | ❌ | ✅ | ✅ |
| Add children, classes, leaders, cards | ❌ | ❌ | ✅ |

A card opens **one child's page and nothing else** — not the roster, not
another child, not the admin screens. That is enforced in the middleware, in
front of every page, rather than by each page remembering to check, so a page
added next year cannot forget it.

Leaders sign in with a **6–12 digit PIN**. Wrong guesses are counted and the
account locks itself: nothing for the first four (a volunteer mistyping in a
noisy room is normal), then 5, 15 and 60 minutes. Without that, six digits is
a few hours of patient guessing.

The app cannot be used at all until the first admin exists, and `/setup`
refuses to run once one does.

## Why this is not the family app

It started as a pocket-money chart for four children. Three things had to
change for two hundred, and each is a decision rather than an accident:

1. **Children are reached by id, not by a name in the URL.** `/kate` is lovely
   for four children and impossible for two hundred: names collide — there
   will be three Jacobs — and resolving a name meant reading every row and
   matching in JavaScript on every page load.
2. **Colour belongs to the class, not the child.** Four distinct colours is a
   personality; two hundred is a swatch book.
3. **Every screen is bounded.** The front page sums per class, a class page
   sums the two dozen children in it, a child's page sums one child. Nothing
   anywhere loads a whole ledger to add it up.

## Does it actually hold up at 200?

Measured, on 200 children and 16,000 ledger entries covering two years:

| Screen | Server time |
|---|---|
| Front page (8 classes + totals) | 6 ms |
| A class page (24 children + balances) | 1 ms |
| A child's balance | 1 ms |
| A child's history, 25 rows | <1 ms |
| Search | 1 ms |
| Standings | 8 ms |

End to end over HTTP every page came back in 20–45 ms and under 24 KB.

Honest footnote: at this size raw speed was never going to be the problem —
SQLite aggregates tens of thousands of rows in milliseconds. The reason the
queries are written this way is that nothing in them grows without limit, so
the numbers above stay roughly the same in year five.

## Running it locally

    npm install
    npx wrangler d1 migrations apply kidsbucks --local
    npm run dev

Then open the dev URL and `/setup` will ask for your name and a PIN.

To see it full of demo children first:

    node scripts/seed-demo.mjs > demo.sql
    npx wrangler d1 execute kidsbucks --local --file=demo.sql

That **deletes everything** and inserts 200 fake children. Never point it at a
database with real children in it. `CHILDREN=50 WEEKS=20 node scripts/seed-demo.mjs`
makes a smaller one.

## Deploying

See **SETUP.md**. The short version: create a D1 database, paste its id into
`wrangler.jsonc`, apply the migrations to it, and deploy.

## Before calling anything done

    npm run check && npm test && npm run build

No test framework, deliberately: `node --experimental-strip-types` runs the
TypeScript directly and the tests are files of `eq(label, got, want)` calls
that exit non-zero. Keep `lib/bucks.ts`, `lib/roster.ts`, `lib/chunk.ts`,
`lib/lockout.ts`, `lib/cards.ts` and `lib/colour.ts` importing nothing from
the database so they stay testable that way.

## Things that will bite you

- **D1 allows 100 BOUND PARAMETERS per statement, not 100 rows.** Awarding a
  class of 24 binds 24 × 7 = 168 and is refused outright. Every bulk insert
  goes through `lib/chunk.ts`. This was found by awarding a real-sized class;
  it would have failed on the first Sunday.
- **Cloudflare Workers refuses PBKDF2 above 100,000 rounds** — and only in
  production, because the local runtime allows more. `lib/pin.ts` sits at
  100,000 and a test holds the ceiling.
- **`scripts/postbuild.mjs` keeps the compiled server out of the public asset
  upload.** `dist/` is wiped on every build, so it has to run every time. Do
  not delete it.
- **A hidden `<input name="dir">` and a `<button name="dir">` in the same form
  both submit**, and `formData.get()` returns whichever is first in the DOM —
  so a "Take off" button can quietly award. Award and deduct live in separate
  forms for this reason.
- **`@cloudflare/workers-types` puts HTMLRewriter's `Element` in global
  scope**, which shadows the DOM one and breaks `<T extends Element>` and
  `.append()` in any client script.
- **Two children with the same name in the same class look identical** in the
  roster. The importer flags duplicates; rename one of them.
