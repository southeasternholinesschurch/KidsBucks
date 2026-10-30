# Setting up KidsBucks

Start to finish, about twenty minutes. You need a Cloudflare account (free
tier is fine) and Node installed.

It runs on Cloudflare Workers and D1. At 200 children and weekly services this
sits inside the free tier; if it ever doesn't, it's a few dollars a month.

---

## 1. Get the code and install

    git clone <this repo> kidsbucks
    cd kidsbucks
    npm install

## 2. Sign in to Cloudflare

    npx wrangler login

A browser opens. **Check it's the account you mean** — if you have more than
one, make sure you authorise the one that owns the domain you want to use.
Getting this wrong is the single commonest way this goes sideways, and the
error you get later ("Could not find zone") does not mention accounts.

## 3. Make the database

    npx wrangler d1 create kidsbucks

It prints a `database_id`. Open `wrangler.jsonc` and paste it over
`PASTE_DATABASE_ID_HERE`.

Leave the binding as `"DB"` — every query reads `env.DB`. Wrangler will
suggest `kidsbucks` as a binding name; ignore that.

## 4. Create the tables

    npx wrangler d1 migrations apply kidsbucks --local
    npx wrangler d1 migrations apply kidsbucks --remote

**Do this before you deploy.** Every page queries these tables on load, so
deploying first gives you an error on every page until the migration lands.

## 5. Deploy

    npm run build
    npx wrangler deploy

That gives you a `.workers.dev` address. Open it.

## 6. First run

The app sends you to `/setup` and will not do anything else until it's done.

Enter **your name** and **a PIN of 6 to 12 digits**. Six, not four: this
address is reachable from anywhere.

If you have your roster handy, paste it into the box — one child per line,
optionally `Name, Class`. Straight from a spreadsheet works; commas or tabs
both. Classes that don't exist yet get created. You can skip this and do it
later from Manage → Children.

`/setup` refuses to run once a leader exists, so nobody can use it later to
add themselves as an admin.

---

## Putting it on your own domain (optional)

Your domain has to be on **the same Cloudflare account** you deployed from.
Then in `wrangler.jsonc` replace:

    "workers_dev": true

with:

    "routes": [{ "pattern": "bucks.yourchurch.org", "custom_domain": true }]

and deploy again. Cloudflare creates the DNS record and the certificate.

Give it a minute. If your own machine says "could not resolve host" while
`dig` finds it, that's your computer caching the old lookup, not a broken
deploy.

---

## Day-to-day

**Adding leaders** — Manage → Leaders. Give each volunteer their own PIN; tell
them in person. You can reset a PIN here if they forget, which also clears any
lockout. Keep at least two admins: the app refuses to remove the last one, but
a second pair of hands is worth having anyway.

**Printing cards** — Manage → Cards. Pick a class, press "Make the missing
ones", then "Print these cards". Only children without an active card get one,
so the button is safe to press twice. Three cards per row on plain paper; cut
them up and laminate if you're feeling fancy.

**Giving points** — Tap a class, then either "+5" under *Everyone here* for
the whole class, or tap one child. Every entry records which leader made it.

**Undoing** — A class award can be undone whole from the banner right after
you do it. A single entry has an "undo" beside it on the child's page. Both
write a correction rather than deleting, so the history still shows what
happened.

**Spending** — Use "Take off" when a child cashes points in at the prize
table. There's no item store on purpose: you have a real prize box, and the
app only does the arithmetic.

---

## Things worth knowing

- **Nothing is ever deleted.** Children, classes and leaders are archived, and
  undo writes an opposite entry. A child's history outlives their being on the
  roster.
- **A child's card opens their page and nothing else.** Not the roster, not
  another child. If one goes missing, revoke it in Manage → Cards and the card
  stops working immediately — including on a phone that already scanned it.
- **Leader PINs lock after repeated wrong guesses** — nothing for the first
  four, then 5, 15 and 60 minutes.
- **Two children with the same name in the same class look identical.** The
  roster importer warns you about duplicates; rename one of them (middle
  initial, or the parent's surname).
- **Importing the same roster twice creates duplicates.** It doesn't match
  against existing children.

## Trying it before it's real

    node scripts/seed-demo.mjs > demo.sql
    npx wrangler d1 execute kidsbucks --local --file=demo.sql
    npm run dev

200 fake children across 8 classes with two years of history, so you can see
what it looks like full. **It deletes everything first** — only ever run it
against `--local`, never a database with real children in it.

## If something breaks

    npx wrangler tail kidsbucks

shows live errors from the deployed app, which is usually faster than
guessing.

    npm run check && npm test && npm run build

is the gate before any change. All three should be clean.
