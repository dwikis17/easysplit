# Splitwise-style App — Backend PRD

## 1. Document Info
- Product: Splitwise-style expense sharing app
- Scope: Backend only
- Platforms served: iOS app initially
- Backend stack: Supabase (Auth, Postgres, Storage, Realtime optional), custom backend/service layer, RevenueCat integration
- Source of truth:
  - App data: Backend database
  - Premium entitlement: Backend validates and serves entitlement state
  - Authentication: Supabase Auth

## 2. Goal
Build a reliable backend for shared expense tracking across groups and trips. The backend must support invitations, expense recording, balance calculation, debt simplification, settlements, multi-currency handling, and premium feature gating.

## 3. Problem Statement
Users need a simple way to track shared expenses with friends, families, roommates, and travel groups. Existing pain points:
- Manual tracking is error-prone
- Members join late or via email invite
- Expenses need multiple split modes
- Settlement status is often unclear
- Premium access must be enforced consistently across devices
- Currency differences complicate balances and reports

## 4. Product Objectives
1. Let users create groups and trips and invite members.
2. Let members add, edit, and delete expenses with auditability.
3. Maintain accurate balances at all times.
4. Provide simplified debt recommendations.
5. Support pending email invites before a user signs up.
6. Enforce premium entitlements with backend as source of truth.
7. Support one clear currency model that can expand later.
8. Expose stable APIs for iOS and future clients.

## 5. Non-Goals (v1)
- Web client
- Direct bank/payment processing
- OCR receipt extraction
- Offline-first sync engine
- Complex tax/VAT calculations
- Shared family billing rules beyond basic expenses
- Cross-group netting of balances

## 6. Users and Roles
### User Types
- Registered user
- Invited but not-yet-registered user

### Group Roles
- Owner
- Admin
- Member

### Permissions
#### Owner
- Update group/trip settings
- Invite/remove members
- Promote/demote admins
- Transfer ownership
- Archive group/trip

#### Admin
- Invite members
- Update some group settings
- Remove regular members

#### Member
- View joined groups/trips
- Add expenses
- Edit/delete own expenses (subject to rules)
- Record settlements

## 7. Core Entities
- User
- Profile
- Group
- Group member
- Invite
- Expense
- Expense participant split
- Settlement
- Balance snapshot or computed balance view
- Activity log
- Premium entitlement
- Exchange rate record

## 8. Core Features

### 8.1 Authentication and Identity
- Sign in/up via Supabase Auth
- OAuth providers supported through Supabase
- Backend trusts authenticated Supabase user identity after token verification
- Backend maps auth user to app profile record

#### Requirements
- Every authenticated request resolves to exactly one app user
- Email normalization must be consistent
- OAuth signup should automatically attach eligible pending invites by matching normalized email

### 8.2 Groups and Trips
The system supports two containers with near-identical behavior:
- Group: open-ended shared expense container
- Trip: time-bounded shared expense container with optional start/end dates

#### Group/Trip fields
- id
- type: `group` or `trip`
- name
- description
- base_currency
- owner_id
- status: `active`, `archived`
- start_date/end_date for trip only
- created_at/updated_at

#### Requirements
- Users can create a group or trip
- Creator becomes owner
- Base currency is required at creation
- Archived groups remain readable but not editable except by explicit restore flow

### 8.3 Invitations
Users can invite others by email.

#### Requirements
- Invite by email to a group/trip
- Invite has states: `pending`, `accepted`, `declined`, `revoked`, `expired`
- Existing registered user can accept directly
- Non-registered recipient can sign up later and then accept
- Backend must preserve invite across signup
- Duplicate active invites to same email for same group should be prevented
- Optional invite token/share link can be added later without breaking model

### 8.4 Membership
- Accepted invite creates membership record
- Membership has role and status
- Members may leave group if not owner
- Owner transfer required before owner can leave

### 8.5 Expenses
Users add expenses to a group/trip.

#### Required fields
- group_id
- title
- amount
- currency
- expense_date
- paid_by payload (one or more payers)
- split_method
- participants/splits
- category optional
- notes optional
- receipt_url optional

#### Supported split methods in v1
- equal
- exact
- percentage

#### Nice-to-have later
- shares/weights

#### Expense rules
- Total paid amount must equal expense total
- Participant split total must equal expense total after rounding normalization
- Only active members can be assigned as participants or payers
- Expense currency may differ from group base currency
- Backend stores both original expense currency values and normalized base-currency values

### 8.6 Expense Editing and Deletion
- Users can edit expenses they created
- Admin/owner can edit any expense in their group
- Soft delete only in v1
- Every update/delete must create activity log event
- Recalculation of balances must be deterministic

### 8.7 Balances
Balances represent net debts between members inside a group.

#### Requirements
- Backend provides per-group member balances
- Backend provides pairwise obligations
- Negative means user owes; positive means user is owed, or use an explicit contract field to avoid ambiguity
- Calculation must exclude declined/revoked invites and inactive members unless historical expense still references them
- Deleted expenses and reversed settlements must not affect active balances

### 8.8 Simplify Debt
Backend returns an optimized settlement suggestion set from current net balances.

#### Requirements
- Suggestions must preserve net results
- Suggestions are advisory only, not automatic settlements
- Simplification is group-scoped only
- Must handle rounding safely

### 8.9 Settlements
Users can record that one member paid another.

#### Requirements
- Settlement belongs to group
- Settlement has payer, receiver, amount, currency, date, notes
- Settlement reduces outstanding balances
- Partial settlement is supported naturally through amount
- Settlement history is immutable except soft-delete by admin/owner or creator with audit log

### 8.10 Multi-Currency
#### v1 currency model
- Each group has one required base currency
- Expenses may be entered in another currency
- Backend stores conversion rate used at creation time
- Normalized base-currency amount is persisted for auditability
- Historical balances use stored conversion rate, not latest live rate

#### Requirements
- Currency code uses ISO 4217
- Exchange rate source must be recorded
- Manual rate override allowed for server/internal admin later; client not required in v1

### 8.11 Charts and Analytics
Backend must provide aggregated data endpoints for charts.

#### Required aggregates
- Total spend by member
- Total spend by category
- Spend over time
- Outstanding owed vs owing summary
- Trip/group total spend

### 8.12 Premium and RevenueCat
Premium status is gated by backend.

#### Principle
RevenueCat is not the final authority for clients directly. Backend validates RevenueCat-derived entitlement state and exposes a canonical entitlement response.

#### Requirements
- Backend stores customer entitlement state per user
- RevenueCat webhook updates backend entitlement state
- Backend can optionally verify entitlement with RevenueCat on-demand for recovery flows
- Client asks backend for entitlement status
- Premium-only features are enforced server-side where applicable

#### Candidate premium gates
- advanced analytics
- unlimited active trips/groups
- receipt uploads beyond quota
- export functionality
- advanced reminders later

### 8.13 Notifications
Backend emits notification events for:
- invite sent
- invite accepted
- expense added
- expense edited
- settlement recorded
- premium status changed

Delivery channels may be implemented later, but event generation should exist in backend domain model.

### 8.14 Activity Log / Audit Trail
Each meaningful action creates an immutable event:
- group created
- member invited
- invite accepted/declined
- expense created/updated/deleted
- settlement created/deleted
- ownership transferred

## 9. Functional Requirements

### FR-1 Auth
Backend must verify Supabase JWT on every authenticated endpoint.

### FR-2 Group Creation
Authenticated user can create a group/trip with base currency.

### FR-3 Invitations
User with permission can invite by email. Invite remains pending until acted on or expired.

### FR-4 Invite Acceptance
Authenticated recipient can accept invite, creating membership.

### FR-5 Expense Recording
Authorized member can create expense with equal, exact, or percentage split.

### FR-6 Balance Accuracy
Balances must reflect all active expenses and settlements in deterministic fashion.

### FR-7 Debt Simplification
Backend returns settlement suggestions based on current balances.

### FR-8 Settlement Recording
Authorized member can record settlement between two active members.

### FR-9 Premium Source of Truth
Backend exposes current premium entitlement and enforces premium-only operations.

### FR-10 Analytics
Backend exposes group analytics aggregates for chart rendering.

### FR-11 Currency
Backend must support group base currency and per-expense currency with stored exchange rate.

### FR-12 Auditability
All mutations create activity log entries.

## 10. Non-Functional Requirements
### Performance
- Common read endpoints should respond within 300 ms p50 under normal load
- Expense creation with recalculation should respond within 700 ms p50
- Simplify debt should remain performant for typical group sizes up to 100 members

### Reliability
- Mutations must be transactional
- Balance-affecting writes must be idempotent where reasonable
- Webhook processing must be retry-safe

### Security
- Supabase JWT verification
- RLS on tables if direct Supabase access is used
- Service role access restricted to backend only
- Email invite endpoints rate-limited
- Signed URLs for receipt uploads

### Observability
- Structured logs
- Traceable request IDs
- Audit event IDs
- Webhook event deduplication logs

### Data Integrity
- Monetary values stored as integer minor units where possible
- Explicit currency per monetary field
- Rounding policy must be centralized

## 11. Business Rules
1. A user cannot have more than one active membership in the same group.
2. A pending invite for the same normalized email and group must be unique.
3. Only members can create expenses or settlements in a group.
4. Owners cannot leave a group until ownership is transferred.
5. Expense totals and split totals must match after normalization rules.
6. Historical balances use stored exchange rate from time of expense creation.
7. Entitlement changes do not alter historical data; they only affect access to premium features.
8. Soft-deleted expenses and settlements must remain auditable.

## 12. Suggested Data Model

### users
- id (uuid)
- auth_user_id (uuid, unique)
- email_normalized
- created_at

### profiles
- user_id
- display_name
- avatar_url
- preferred_currency
- timezone

### groups
- id
- type
- name
- description
- base_currency
- owner_id
- status
- start_date
- end_date
- created_at
- updated_at

### group_members
- id
- group_id
- user_id
- role
- status
- joined_at
- left_at

### invites
- id
- group_id
- email_normalized
- invited_by_user_id
- status
- token nullable
- expires_at
- responded_at
- accepted_by_user_id nullable
- created_at

### expenses
- id
- group_id
- created_by_user_id
- title
- category
- notes
- expense_date
- original_amount_minor
- original_currency
- base_amount_minor
- base_currency
- fx_rate
- fx_source
- split_method
- status
- receipt_path nullable
- created_at
- updated_at
- deleted_at nullable

### expense_payers
- id
- expense_id
- user_id
- original_paid_amount_minor
- base_paid_amount_minor

### expense_splits
- id
- expense_id
- user_id
- split_type
- original_owed_amount_minor
- base_owed_amount_minor
- percentage nullable
- exact_amount nullable

### settlements
- id
- group_id
- from_user_id
- to_user_id
- original_amount_minor
- original_currency
- base_amount_minor
- base_currency
- fx_rate
- settlement_date
- notes
- created_by_user_id
- status
- created_at
- deleted_at nullable

### entitlement_states
- id
- user_id
- is_premium
- product_id
- entitlement_id
- source
- status
- current_period_ends_at
- updated_at

### revenuecat_webhook_events
- id
- event_id unique
- event_type
- payload_json
- processed_at
- processing_status

### activity_logs
- id
- group_id
- actor_user_id
- entity_type
- entity_id
- action
- metadata_json
- created_at

### exchange_rates
- id
- base_currency
- quote_currency
- rate
- source
- effective_at

## 13. API Domain Modules
- Auth context
- Profile
- Groups/Trips
- Invites
- Memberships
- Expenses
- Balances
- Settlements
- Analytics
- Premium Entitlements
- Webhooks
- Uploads
- Activity

## 14. Key Workflows

### Workflow A: Create Group
1. Authenticated user sends create group request
2. Backend validates currency and payload
3. Backend creates group and owner membership in one transaction
4. Activity log created
5. Response returns group summary

### Workflow B: Invite User by Email
1. Member with permission submits email
2. Backend normalizes email and checks duplicate active invite/membership
3. Invite row created
4. Notification event emitted
5. If user already exists, invite becomes visible immediately in their pending invites list

### Workflow C: Accept Invite
1. Authenticated user requests acceptance
2. Backend verifies invite belongs to normalized user email or valid token flow
3. Membership created transactionally
4. Invite marked accepted
5. Activity log and notification event emitted

### Workflow D: Add Expense
1. Member submits expense payload
2. Backend validates membership, split totals, payers, currency
3. Backend resolves exchange rate and persists original + base amounts
4. Expense, payer rows, split rows created in one transaction
5. Activity event created
6. Balances become queryable via computed view/service

### Workflow E: Record Settlement
1. Member records settlement from A to B
2. Backend validates amount and membership
3. Settlement stored with currency normalization
4. Activity event created
5. Balances updated in subsequent reads/computation

### Workflow F: Premium Refresh
1. RevenueCat webhook arrives
2. Backend verifies event authenticity and deduplicates
3. Backend updates entitlement state
4. Clients receive updated canonical entitlement on next fetch

## 15. Edge Cases
- Invited email differs in case or spacing from signup email
- User signs in with OAuth after invite was created
- Expense edited after members leave group
- Expense participant removed from group after old expense exists
- Currency conversion introduces remainder in minor units
- Settlement in non-base currency
- Subscription expires while user is in premium-only screen
- Duplicate RevenueCat webhook delivery
- Owner deletion/leave attempts without transfer

## 16. Success Metrics
- Invite acceptance rate
- Expense creation success rate
- Balance mismatch incidents = 0 known defects
- Settlement completion rate
- Webhook processing success rate
- Premium entitlement mismatch rate below defined threshold
- Average response time for core endpoints

## 17. Open Decisions
1. Should trip and group share one table with `type`, or separate tables?
2. Should balances be fully computed on read, or cached/snapshotted?
3. Should expense edit permissions allow any member or creator/admin only?
4. Should receipt uploads be premium-only from v1?
5. Should non-members be allowed to view invite preview details?
6. Which exchange-rate provider will be used?
7. Will debt simplification use greedy settlement optimization or a more constrained algorithm?

## 18. Recommended v1 Decisions
- Single `groups` table with `type`
- Compute balances from normalized ledger tables first; add caching only if needed
- Creator/admin/owner can edit expenses; soft delete only
- Group base currency required
- Per-expense exchange rate locked at creation time
- RevenueCat webhook + entitlement table as canonical premium model
- Equal, exact, percentage split methods in v1

## 19. Delivery Phases
### Phase 1
- Auth integration
- Group/trip CRUD
- Membership + invites
- Expense create/list/read
- Basic balances
- Settlements

### Phase 2
- Expense edit/delete
- Activity log
- Analytics endpoints
- Premium entitlement integration
- Receipt storage plumbing

### Phase 3
- Performance improvements
- Notifications
- Advanced premium features
- Share-link invites
- Export/reporting
