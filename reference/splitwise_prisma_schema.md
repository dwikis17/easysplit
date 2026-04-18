# Splitwise-style App — Prisma Schema (Express.js + Prisma + PostgreSQL)

This is a **starter Prisma schema** for the backend described in the PRD and API contract.

It is designed for:
- **Express.js** API layer
- **Prisma ORM**
- **PostgreSQL**
- **Supabase Auth** for authentication
- **RevenueCat** entitlement sync handled by backend

## Notes

- `User.id` is a string so it can match **Supabase Auth user id**.
- Money fields use `Decimal` for safer currency storage.
- `Balance` is stored as a derived/cache table for fast reads. You can also compute it dynamically if you prefer.
- `ExpenseParticipant` stores each user's share and net balance impact for an expense.
- `Trip` is modeled through `Group.type = TRIP` plus optional trip fields directly on `Group`.
- Invitations support pre-signup email flows.

---

## Suggested `schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                    String                  @id @db.Uuid
  email                 String                  @unique
  fullName              String?
  avatarUrl             String?
  preferredCurrencyCode String?                 @db.VarChar(3)
  timezone              String?
  isDeleted             Boolean                 @default(false)
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt

  memberships           GroupMember[]
  createdExpenses       Expense[]               @relation("ExpensePayer")
  expenseParticipants   ExpenseParticipant[]
  settlementsPaid       Settlement[]            @relation("SettlementPayer")
  settlementsReceived   Settlement[]            @relation("SettlementReceiver")
  sentInvites           Invite[]                @relation("InviteInviter")
  activityLogs          ActivityLog[]
  pushTokens            PushToken[]
  subscriptions         Subscription[]
  entitlementEvents     RevenueCatWebhookEvent[]
}

model Group {
  id               String          @id @default(uuid()) @db.Uuid
  name             String
  type             GroupType
  description      String?
  baseCurrencyCode String          @db.VarChar(3)
  coverImageUrl    String?
  isArchived       Boolean         @default(false)

  // Trip-specific optional fields
  tripStartDate    DateTime?
  tripEndDate      DateTime?
  destination      String?

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  members          GroupMember[]
  invites          Invite[]
  expenses         Expense[]
  balances         Balance[]
  settlements      Settlement[]
  categories       ExpenseCategory[]
  activityLogs     ActivityLog[]
}

model GroupMember {
  id           String          @id @default(uuid()) @db.Uuid
  groupId      String          @db.Uuid
  userId       String          @db.Uuid
  role         GroupRole
  status       MembershipStatus @default(ACTIVE)
  joinedAt     DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  group        Group           @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@index([userId])
  @@index([groupId])
}

model Invite {
  id             String       @id @default(uuid()) @db.Uuid
  groupId         String       @db.Uuid
  invitedByUserId String       @db.Uuid
  email          String
  role           GroupRole    @default(MEMBER)
  token          String       @unique
  status         InviteStatus @default(PENDING)
  expiresAt      DateTime
  acceptedAt     DateTime?
  declinedAt     DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  group          Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  invitedBy      User         @relation("InviteInviter", fields: [invitedByUserId], references: [id], onDelete: Cascade)

  @@index([groupId])
  @@index([email])
  @@index([status])
}

model ExpenseCategory {
  id          String     @id @default(uuid()) @db.Uuid
  groupId      String     @db.Uuid
  name        String
  icon        String?
  color       String?
  isDefault   Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  group       Group      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  expenses    Expense[]

  @@unique([groupId, name])
  @@index([groupId])
}

model Expense {
  id                    String                 @id @default(uuid()) @db.Uuid
  groupId                String                 @db.Uuid
  categoryId            String?                @db.Uuid

  title                 String
  description           String?
  notes                 String?

  amount                Decimal                @db.Decimal(18, 4)
  currencyCode          String                 @db.VarChar(3)

  // Conversion to group's base currency
  fxRateToBase          Decimal?               @db.Decimal(18, 8)
  amountInBase          Decimal?               @db.Decimal(18, 4)
  fxRateSource          FxRateSource?

  paidByUserId          String                 @db.Uuid
  splitMethod           SplitMethod
  expenseDate           DateTime
  receiptUrl            String?
  location              String?
  isDeleted             Boolean                @default(false)
  version               Int                    @default(1)
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt

  group                 Group                  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  category              ExpenseCategory?       @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  paidBy                User                   @relation("ExpensePayer", fields: [paidByUserId], references: [id], onDelete: Restrict)
  participants          ExpenseParticipant[]
  activityLogs          ActivityLog[]

  @@index([groupId])
  @@index([paidByUserId])
  @@index([expenseDate])
  @@index([categoryId])
}

model ExpenseParticipant {
  id                    String                 @id @default(uuid()) @db.Uuid
  expenseId              String                 @db.Uuid
  userId                String                 @db.Uuid

  // Original split input
  splitInputType        SplitInputType?
  splitInputValue       Decimal?               @db.Decimal(18, 6)

  // Final computed values
  owedShare             Decimal                @db.Decimal(18, 4)
  owedShareInBase       Decimal?               @db.Decimal(18, 4)

  // Net effect of this expense for this user in base currency.
  // Positive means the group owes this user.
  // Negative means this user owes the group.
  netBalanceDelta       Decimal?               @db.Decimal(18, 4)

  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt

  expense                Expense                @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user                  User                   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([expenseId, userId])
  @@index([userId])
  @@index([expenseId])
}

model Balance {
  id                    String       @id @default(uuid()) @db.Uuid
  groupId                String       @db.Uuid
  fromUserId            String       @db.Uuid
  toUserId              String       @db.Uuid
  amount                Decimal      @db.Decimal(18, 4)
  currencyCode          String       @db.VarChar(3)
  updatedAt             DateTime     @updatedAt
  createdAt             DateTime     @default(now())

  group                 Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([groupId, fromUserId, toUserId])
  @@index([groupId])
  @@index([fromUserId])
  @@index([toUserId])
}

model Settlement {
  id                    String           @id @default(uuid()) @db.Uuid
  groupId                String           @db.Uuid
  fromUserId            String           @db.Uuid
  toUserId              String           @db.Uuid
  amount                Decimal          @db.Decimal(18, 4)
  currencyCode          String           @db.VarChar(3)
  fxRateToBase          Decimal?         @db.Decimal(18, 8)
  amountInBase          Decimal?         @db.Decimal(18, 4)
  method                SettlementMethod?
  note                  String?
  settledAt             DateTime
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  group                 Group            @relation(fields: [groupId], references: [id], onDelete: Cascade)
  fromUser              User             @relation("SettlementPayer", fields: [fromUserId], references: [id], onDelete: Restrict)
  toUser                User             @relation("SettlementReceiver", fields: [toUserId], references: [id], onDelete: Restrict)

  @@index([groupId])
  @@index([fromUserId])
  @@index([toUserId])
  @@index([settledAt])
}

model ActivityLog {
  id             String           @id @default(uuid()) @db.Uuid
  groupId         String?          @db.Uuid
  expenseId       String?          @db.Uuid
  actorUserId     String?          @db.Uuid
  entityType      ActivityEntityType
  action          ActivityAction
  payload         Json?
  createdAt       DateTime         @default(now())

  group           Group?           @relation(fields: [groupId], references: [id], onDelete: Cascade)
  expense         Expense?         @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  actorUser       User?            @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([groupId])
  @@index([expenseId])
  @@index([actorUserId])
  @@index([createdAt])
}

model Subscription {
  id                        String               @id @default(uuid()) @db.Uuid
  userId                    String               @db.Uuid
  provider                  SubscriptionProvider
  revenueCatAppUserId       String?
  originalTransactionId     String?
  productId                 String?
  entitlementKey            String?
  status                    SubscriptionStatus
  expiresAt                 DateTime?
  gracePeriodEndsAt         DateTime?
  willRenew                 Boolean?
  rawData                   Json?
  createdAt                 DateTime             @default(now())
  updatedAt                 DateTime             @updatedAt

  user                      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([provider])
  @@index([status])
  @@unique([provider, originalTransactionId])
}

model RevenueCatWebhookEvent {
  id                String     @id @default(uuid()) @db.Uuid
  userId            String?    @db.Uuid
  eventType         String
  eventId           String?    @unique
  revenueCatAppUserId String?
  payload           Json
  processedAt       DateTime?
  createdAt         DateTime   @default(now())

  user              User?      @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([eventType])
  @@index([createdAt])
}

model PushToken {
  id          String      @id @default(uuid()) @db.Uuid
  userId       String      @db.Uuid
  platform    DevicePlatform
  token       String      @unique
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([platform])
}

enum GroupType {
  GROUP
  TRIP
}

enum GroupRole {
  OWNER
  ADMIN
  MEMBER
}

enum MembershipStatus {
  ACTIVE
  LEFT
  REMOVED
}

enum InviteStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
  CANCELLED
}

enum SplitMethod {
  EQUAL
  EXACT
  PERCENTAGE
  SHARES
}

enum SplitInputType {
  AMOUNT
  PERCENTAGE
  SHARE
}

enum FxRateSource {
  SYSTEM
  MANUAL
}

enum SettlementMethod {
  CASH
  BANK_TRANSFER
  EWALLET
  OTHER
}

enum ActivityEntityType {
  GROUP
  MEMBER
  INVITE
  EXPENSE
  SETTLEMENT
  SUBSCRIPTION
}

enum ActivityAction {
  CREATED
  UPDATED
  DELETED
  ACCEPTED
  DECLINED
  JOINED
  LEFT
  REMOVED
  SETTLED
  EXPIRED
  SYNCED
}

enum SubscriptionProvider {
  REVENUECAT
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  CANCELLED
  BILLING_ISSUE
  TRIALING
}

enum DevicePlatform {
  IOS
  ANDROID
  WEB
}
```

---

## Recommended implementation notes

### 1. Supabase Auth mapping
Use the Supabase user id directly as `User.id`.

Typical backend flow:
1. Verify Supabase JWT in Express middleware.
2. Extract `sub` as user id.
3. Upsert user in your `User` table.

### 2. Balance strategy
You have two valid options:

#### Option A — compute on demand
- simpler source of truth
- less risk of stale balances
- slower for large groups

#### Option B — maintain `Balance` table
- faster reads for mobile app
- more complex writes
- requires recalculation after expense edits/deletes/settlements

For MVP, many teams still use **computed balances + cached summary**.

### 3. Simplified debt
Store raw balances first, then generate simplified transfers in service logic.
Do **not** store simplified debt as permanent source of truth unless needed.

Suggested:
- `Balance` = raw directional balances
- API response `/groups/:id/balances` returns:
  - raw balances
  - simplified settlements

### 4. Multi-currency rule
Recommended approach:
- every expense stores original `amount` + `currencyCode`
- also store `fxRateToBase` and `amountInBase`
- group balances are computed in `group.baseCurrencyCode`

This keeps reporting and settlement logic much easier.

### 5. Expense participant math
For each expense participant, store:
- original split input
- final computed owed share
- normalized base share
- net balance impact

This makes recalculation and debugging much easier.

### 6. Soft delete
`Expense.isDeleted = true` is safer than hard delete.
Then recalculate balances and write an `ActivityLog` event.

### 7. Versioning
`Expense.version` helps prevent overwrite conflicts.
You can require client to send expected version when updating.

---

## Example service-layer calculations

### Equal split
Expense amount = 120
Participants = A, B, C
Paid by A

Each owed share = 40
- A net = +80
- B net = -40
- C net = -40

### Exact split
Amount = 100
- A owes 20
- B owes 30
- C owes 50
Paid by A

Net:
- A = +80
- B = -30
- C = -50

### Settlement
If B pays A 30:
- create `Settlement`
- reduce balance from B -> A by 30
- add activity log entry

---

## Suggested next tables later if needed

You may add these later instead of in MVP:
- `RecurringExpense`
- `Budget`
- `Attachment`
- `EmailLog`
- `AuditSnapshot`
- `ExchangeRate`
- `Notification`

---

## Recommended first migration order

1. enums
2. user
3. group
4. group_member
5. invite
6. expense_category
7. expense
8. expense_participant
9. settlement
10. balance
11. activity_log
12. subscription
13. revenuecat_webhook_event
14. push_token

---

## Practical suggestion

If you want less complexity for v1, you can temporarily remove:
- `Balance`
- `PushToken`
- `RevenueCatWebhookEvent`
- trip-specific fields
- `ExpenseCategory`

Then add them in migration v2.

