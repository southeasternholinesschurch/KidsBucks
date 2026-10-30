-- KidsBucks — a points system for a children's ministry of 150–200.
--
-- Descended from a four-child family app, and deliberately NOT the same
-- schema. Three things changed because of scale, and each is a decision
-- rather than an accident:
--
--   1. CHILDREN ARE REACHED BY ID, NOT BY A NAME IN THE URL. The family app
--      used /kate, which was lovely for four children and impossible for two
--      hundred: names collide (there will be three Jacobs), and finding the
--      right child by slug meant reading every row and matching in JS on
--      every page load. Children are found by card, by group, or by search.
--
--   2. EVERY ENTRY RECORDS WHICH LEADER MADE IT. With a dozen volunteers,
--      "who gave Jayden fifty bucks" has to have an answer.
--
--   3. EVERY LIST IS BOUNDED. A balance is still a SUM and never a stored
--      column, but no screen ever sums the whole ledger: the front page sums
--      per group, a group page sums the ~25 children in it, and a child's
--      page sums one child. That is what keeps this fast at two hundred.

-- Leaders: the people who hand out points.
--
-- Signing in is "tap your name, type your PIN", which costs exactly ONE
-- PBKDF2 verification. Letting a PIN alone identify somebody would mean
-- hashing against every leader in turn, and PBKDF2 is expensive enough that a
-- dozen of them would blow the Worker's CPU budget on every sign-in.
CREATE TABLE `leaders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	-- 'admin' may add children, leaders and groups; 'leader' may only award.
	`role` text DEFAULT 'leader' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	-- A PIN is short and this app is reachable from anywhere, so wrong
	-- guesses are counted and the account locks itself for a while. Without
	-- this, six digits is a few hours of patient guessing.
	`fail_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaders_name` ON `leaders` (`name`);
--> statement-breakpoint

-- Groups: the class or room a child belongs to.
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`colour` text DEFAULT '#4dabff' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name` ON `groups` (`name`);
--> statement-breakpoint

CREATE TABLE `kids` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	-- Lower-cased name, kept only so search can use an index instead of
	-- scanning and lower()-ing two hundred rows on every keystroke.
	`search_name` text NOT NULL,
	-- Nullable: a child can arrive before anybody knows which room they are
	-- in, and an unassigned child must still be able to earn points.
	`group_id` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Name is NOT unique: at this size there really are three Jacobs, and
-- refusing the third is worse than showing a group beside each of them.
CREATE INDEX `kids_search_idx` ON `kids` (`search_name`);
--> statement-breakpoint
CREATE INDEX `kids_group_idx` ON `kids` (`group_id`, `active`);
--> statement-breakpoint

-- A LEDGER, NEVER A BALANCE. Two leaders awarding the same child at the same
-- moment both get counted; a mutable balance would lose one of them. And a
-- child who says "I had more than that" has to be answerable with a list.
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kid_id` integer NOT NULL,
	`delta` integer NOT NULL,
	-- 'award' | 'spend' | 'correction'
	`reason` text NOT NULL,
	`note` text,
	-- Who did it. Nullable because a leader may later be removed, and their
	-- entries must survive them.
	`leader_id` integer,
	-- Groups a bulk award together, so "undo that whole class" is possible
	-- and so the history can say "class award" rather than showing 25
	-- unrelated-looking rows.
	`batch` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`kid_id`) REFERENCES `kids`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leader_id`) REFERENCES `leaders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- The one index that matters: a child's balance and their recent history are
-- both reads of this, and they happen on every page view.
CREATE INDEX `ledger_kid_idx` ON `ledger` (`kid_id`, `id`);
--> statement-breakpoint
CREATE INDEX `ledger_batch_idx` ON `ledger` (`batch`);
--> statement-breakpoint
CREATE INDEX `ledger_when_idx` ON `ledger` (`created_at`);
--> statement-breakpoint

-- A printed card a child scans to see their own total.
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kid_id` integer NOT NULL,
	`code` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	-- Revoked, never deleted: "why did my card stop working" needs an answer,
	-- and the unique index outliving the revocation means a code is never
	-- handed out twice.
	`revoked_at` text,
	`last_used_at` text,
	FOREIGN KEY (`kid_id`) REFERENCES `kids`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_code` ON `cards` (`code`);
--> statement-breakpoint
CREATE INDEX `cards_kid_idx` ON `cards` (`kid_id`);
--> statement-breakpoint

CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
