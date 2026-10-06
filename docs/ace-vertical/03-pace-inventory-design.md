# ACE physical PACE inventory

**Status:** Implementation design for C04 in
`02-oasis-web-journey-parity.md`. Oasis remains a read-only reference.

## Outcome and boundary

Organisation Heads and Site Leads can record physical PACEs ordered for an
actively enrolled child and subject, advance delivery, register existing stock,
and see when a student has two or fewer future PACEs available. This is ACE
core. It does not create a Finance charge or a Merit transaction. Ordinary
staff, parents, and students cannot manage or read the inventory.

The first PR, 1.3b1, delivers the tenant-safe tables, typed permissions, and
PACE-number normalization. Later C04 PRs deliver the guarded API and web
journey; C04 is not complete until those are merged and verified.

Step 1.3b2a adds read-only `GET /ace/pace/inventory/orders` and
`GET /ace/pace/inventory/stock`. Both require the ACE inventory read permission.
Orders are bounded by site, child filter, status filter, and a scoped cursor.
Stock pages include active child/subject choices, normalized current PACE,
future supplied numbers, pending-order state, and an optional attention filter.
The stock response keeps zero stock visible even when an order is pending.
Writing orders, stock, or status transitions remains a separate step.

Step 1.3b2b1 accepts a bounded set of distinct catalogue PACE numbers for one
active child/subject placement. A site leader's guarded request checks for
existing physical supply and pending orders inside a serializable tenant
transaction, then creates the order rows and audit/outbox facts atomically.
Current-stock entry and delivery transitions follow in later PRs.

Step 1.3b2b2 records 1–24 distinct catalogue PACEs as existing physical stock
for one active child/subject placement. It shares the order command's
serializable site, placement, supplied-number, and pending-order checks. Each
accepted number becomes one `CURRENT_STOCK` supply row, with batch audit and
outbox facts in the same transaction. This does not change an order's status.

Step 1.3b2b3 accepts one forward order transition at a time: `ORDERED` to
`IN_TRANSIT`, then `IN_TRANSIT` to `DELIVERED`. The command locks the site-scoped
order and active placement in a serializable tenant transaction, records the
transition and audit/outbox facts atomically, and creates one linked
`DELIVERED_ORDER` supply row only on delivery. A skipped, repeated, or stale
transition fails without changing order or supply history.

Step 1.3b2c1 adds the permission-gated ACE web route for site-scoped stock
attention, all active placements' physical stock, and order history. Each list
uses the bounded API cursor and reloads after an active-site change. It
provides loading, empty, retry, and accessible status states. Order, stock,
and delivery write controls follow in the next web step.

Step 1.3b2c2 adds order creation for actors with
`ace.pace.inventory.manage`. The web form selects future catalogue PACEs for
an active child/subject placement, excludes numbers already in physical stock,
and submits at most 24 distinct numbers to the guarded batch command. The
server checks existing orders and stock in a site-scoped transaction; a
conflict leaves the form open with feedback. Successful creation refreshes
stock attention and order history. Stock entry and delivery actions remain
separate web steps.

Step 1.3b2c3 lets the same permitted managers add existing physical stock
for an active child/subject placement. It uses the shared bounded catalogue
picker and submits future numbers to the guarded `POST /ace/pace/inventory/stock`
command. Supplied numbers are disabled; the server also rejects pending
orders and concurrent changes. Success refreshes stock and order history,
while read-only actors see no write control. An in-flight result from a
previous active site cannot display a success or error in the new site.
Delivery transitions remain a separate web step.

## Data and rules

- `PaceInventoryOrder` stores one catalogue PACE (`1001–1144`) for one child,
  subject, and site. It records creator, ordered time, status (`ORDERED`,
  `IN_TRANSIT`, or `DELIVERED`), and transition times. An order cannot move
  backwards or skip a state. Pending duplicate numbers are rejected.
- `PaceInventorySupply` stores one available physical copy per site, child,
  subject, and catalogue PACE. It records whether stock was entered as current
  stock or delivered from an order, and the actor. Only supply rows count as
  available stock. A delivered order may link to its supply row for provenance.
- Both tables carry `tenantId`, composite child/subject foreign keys, tenant
  indexes, creator membership triggers, and forced tenant RLS. The `anon` and
  `authenticated` database roles receive no direct table grants. The API also
  checks the trusted active site, active child and subject enrolment, vertical
  entitlement, typed permission, and actor scope.
- The existing `parsePaceNumber` accepts `1–144` and `1001–1144`. Inventory
  stores only catalogue numbers; normalize a current PACE from either format
  before computing stock. Available PACEs are distinct supplied numbers above
  the current PACE. An alert appears for one or two future supplied PACEs when
  no future pending order already addresses the gap. No delivered stock means
  an explicit no-stock state, rather than a misleading two-PACE alert.
- Create and delivery commands use a serializable transaction, lock the active
  child/subject enrolment, validate duplicate stock and pending orders, write
  audit/outbox facts, and use conditional status updates. A stale or duplicate
  command fails without partial stock or status changes. Order history is
  retained; supply records are not silently removed.

## API and web completion

The ACE PACE inventory API returns bounded site-scoped pages of orders and
stock alerts, plus active child/subject choices. It accepts bounded bulk order
creation, current-stock entry, and a forward-only status transition. Reads
require `ace.pace.inventory.read`; writes require
`ace.pace.inventory.manage`. These keys are ACE-core capabilities assigned
only to the fixed Organisation Head and Site Lead templates initially. A tag
may delegate them later only through the existing actor-held delegation and
site rules; the Oasis Head role name is not copied.

The admin screen lives under ACE PACE. It leads with low-stock attention,
then a focused order form and a status list. Each control has a visible label,
keyboard access, pending/disabled feedback, and a named error state. Status is
shown with words as well as colour. Layout adapts to narrow screens, supports
larger text and reduced motion, and reuses NexSteps tokens. These decisions
follow the supplied Apple design guidance for clear action hierarchy,
legible lists, and consistent colour meaning.

## Verification and rollout

1. On a disposable Postgres database, apply the migration and prove same-site
   access plus cross-site/organisation denial for both tables. Check database
   constraints, indexes, and API-role grants.
2. Test short/long PACE normalization, duplicate and transition conflicts,
   current-stock entry, delivered-only availability, pending-order alert
   suppression, and audit/outbox rollback.
3. Test Head/Site Lead allow and staff/parent/student deny, then the browser
   journey at desktop and narrow widths with keyboard use and empty/error
   states. A disabled ACE vertical must fail closed.
4. Merge each PR only after current-revision CI passes. Migrate in staging,
   then run production migration and smoke tests only when the source
   Supabase project is recovered or safely moved. If the new UI fails, hide its
   navigation and revert its app release; retain issued order and stock facts
   for audited correction.
