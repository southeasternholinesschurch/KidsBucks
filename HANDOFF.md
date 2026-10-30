# KidsBucks — handover

A points system for a children's ministry of 150–200, already built, tested
and measured at that size. This document is for whoever sets it up — and it
reads fine handed straight to an AI assistant, which is how the app it grew
out of was built.

Everything marked **DECIDED** was settled deliberately and has a reason
written next to it in the code. Everything marked **OPEN** is yours.

---

## 0. Read this first: it already works

This is not a sketch. It is a working app with 380 passing assertions, and it
has been driven end to end against a seeded ministry of 200 children with two
years of history — awarding, undoing, importing, card-scanning, the lot.

**Deploy it before you change anything.** `SETUP.md` is twenty minutes and the
fastest way to find out whether it fits. Fill it with demo children first if
you want to see it full:

    node scripts/seed-demo.mjs > demo.sql
    npx wrangler d1 execute kidsbucks --local --file=demo.sql
    npm run dev

It runs on Cloudflare Workers and D1. At this size that is free or close to it.

---

## 1. What it does, in one minute

- The front page is your **classes**, not two hundred children.
- Tap a class to **award the whole class at once** — the commonest thing
  anybody does with a points system — or tap one child.
- Leaders **sign in as themselves**, so every entry records who made it.
- Children **scan a printed card** to see their own total, and nothing else.
- Paste a roster (or a spreadsheet) to create children and classes in one go.
- Standings rank classes and the top children.

## 2. DECIDED, with the reasoning

These are the load-bearing decisions. Each one is a bug somebody has already
had, or a constraint that was measured rather than guessed.

**A ledger, never a balance.** Every award is a row; a total is their sum. Two
leaders awarding at the same moment both count — a stored balance loses one.
And a child who says "I had more than that" has to be answerable with a list.

**Undo writes an opposite row; nothing is ever deleted.** Children, classes
and leaders archive. A `ledger` row points at `kid_id` with `ON DELETE
CASCADE`, so deleting a child destroys their history. There is no delete
button anywhere, and that is the feature.

**The sign comes from the button, never from what was typed.** `parseAmount`
refuses a minus sign; otherwise "-5" in the take-off box is a five-buck award
and nobody notices for a month.

**A card opens one child's page and nothing else**, enforced in the middleware
in front of every page rather than by each page remembering. The cookie names
the *card*, not the child, and the card is re-read on every request — so
revoking one cuts off the phone that already scanned it, which is the only
case revoking exists for.

**Leader PINs are 6–12 digits and lock on repeated wrong guesses** — nothing
for the first four, then 5, 15 and 60 minutes. Four digits on an address
anybody can reach is a few hours of guessing.

**Children are reached by id, not by name in the URL.** At 200 there are three
Jacobs, and resolving a name meant reading every row on every page load.

**Colour belongs to the class, not the child.** Four distinct colours is a
personality; two hundred is a swatch book.

**Every screen is bounded.** Nothing anywhere loads a whole ledger to add it
up. Measured on 200 children and 16,000 entries: front page 6 ms (now 0 — it
no longer touches the ledger), class page 1 ms, child page 1 ms, search 1 ms.
Over HTTP, 20–45 ms per page.

## 3. Three platform limits that will bite

Each of these cost real time to find. They are documented in the code too.

1. **D1 allows 100 BOUND PARAMETERS per statement, not 100 rows.** Awarding a
   class of 24 binds 24 × 7 = 168 and is refused. All bulk inserts go through
   `lib/chunk.ts`. Found by awarding a real-sized class — it would have failed
   on the first Sunday.
2. **Cloudflare Workers refuses PBKDF2 above 100,000 rounds**, and only in
   production — the local runtime allows more, so tests pass and the deploy
   fails silently. `lib/pin.ts` sits at 100,000 and a test holds it there.
3. **`scripts/postbuild.mjs` keeps the compiled server out of the public asset
   upload.** `dist/` is wiped each build, so it must run every time. Do not
   delete it.

## 4. OPEN — things you may well want

None of these exist. In rough order of how often I'd expect them to be asked
for:

- **Attendance.** Right now a class award is the closest thing. If you want
  actual attendance you probably want a `sessions` table and a present/absent
  mark per child per session, with the award hanging off it.
- **A prize store.** Deliberately absent: you have a real prize box and the
  app only does the arithmetic. If you want one, `spend` already exists as a
  reason — it needs a list of items and a redemption screen.
- **Parent access.** There is no parent role. A child's card is the only
  outside-facing thing, and it is read-only.
- **Teams cutting across classes** (blue vs red). The schema has one group per
  child; teams would be a second table and a second total.
- **Per-class leaders.** Any leader can award any child today. Scoping leaders
  to their own class is a column and a middleware check.
- **Exports.** No CSV out. The data is in D1 and `wrangler d1 execute` will
  dump it.

## 5. Questions only your ministry can answer

Worth settling before you roll out, because they change the work:

1. **What are the classes?** The roster importer creates them from whatever
   your list says, so get the spelling right first — "K-2nd" and "k-2nd" in
   the same paste are treated as one class, but fixing them afterwards is
   manual.
2. **Who gets to be an admin?** Admins add children, classes, leaders and
   cards. Leaders only award. Have at least two admins.
3. **What are bucks actually spent on, and who runs that?** The app records
   the spending; it does not manage a shop.
4. **Do children keep their cards, or do the cards live in a box at the
   door?** Both work. A card that lives in a box is never lost; a card a child
   keeps gets scanned at home by a curious parent, which is fine — it's
   read-only.
5. **Does the ledger ever get pruned?** The answer so far has been no, and at
   this size it can stay no for many years.

## 6. Definition of done

- [ ] Deployed and reachable over HTTPS
- [ ] `/setup` completed once: an admin exists with a 6-digit PIN
- [ ] The real roster imported, classes named correctly
- [ ] A second admin added
- [ ] Cards made and printed for at least one class
- [ ] A leader (not an admin) can sign in and award, and the entry shows their
      name
- [ ] A scanned card shows that child's total and cannot reach anything else
- [ ] A class award can be undone whole
- [ ] `npm run check && npm test && npm run build` all clean
