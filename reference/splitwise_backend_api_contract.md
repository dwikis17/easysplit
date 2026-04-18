# Splitwise-style App — Backend API Contract

## 1. Overview
This document defines the initial REST API contract for the backend.

### Base principles
- Transport: JSON over HTTPS
- Auth: Bearer token using Supabase JWT
- Time format: ISO 8601 UTC timestamps
- Monetary format: integer minor units unless otherwise noted
- Currency: ISO 4217 uppercase codes
- Idempotency: supported on selected mutation endpoints via `Idempotency-Key`

### Base URL
`/v1`

## 2. Authentication
All authenticated endpoints require:

`Authorization: Bearer <supabase_jwt>`

Backend responsibilities:
- verify JWT
- map auth subject to internal user
- reject unauthorized or disabled users

## 3. Common Response Envelope
Success:
```json
{
  "data": {},
  "meta": {
    "request_id": "req_123"
  }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Split totals do not match expense total",
    "details": {
      "field": "splits"
    }
  },
  "meta": {
    "request_id": "req_123"
  }
}
```

## 4. Error Codes
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `RATE_LIMITED`
- `PREMIUM_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `INTERNAL_ERROR`

## 5. Auth / Me

### GET `/me`
Returns current user profile and entitlement summary.

#### Response
```json
{
  "data": {
    "user": {
      "id": "usr_123",
      "email": "user@example.com",
      "display_name": "Dwiki",
      "avatar_url": null,
      "preferred_currency": "USD",
      "timezone": "Asia/Jakarta"
    },
    "entitlement": {
      "is_premium": true,
      "source": "revenuecat",
      "status": "active",
      "current_period_ends_at": "2026-05-10T00:00:00Z"
    }
  },
  "meta": {
    "request_id": "req_1"
  }
}
```

### PATCH `/me`
Update profile fields.

#### Request
```json
{
  "display_name": "Dwiki D",
  "preferred_currency": "IDR",
  "timezone": "Asia/Jakarta"
}
```

## 6. Groups and Trips

### POST `/groups`
Create a group or trip.

#### Request
```json
{
  "type": "group",
  "name": "Bali House",
  "description": "Shared house expenses",
  "base_currency": "IDR"
}
```

Trip example:
```json
{
  "type": "trip",
  "name": "Japan 2026",
  "description": "Tokyo + Osaka",
  "base_currency": "JPY",
  "start_date": "2026-06-10",
  "end_date": "2026-06-18"
}
```

#### Response
```json
{
  "data": {
    "group": {
      "id": "grp_123",
      "type": "group",
      "name": "Bali House",
      "description": "Shared house expenses",
      "base_currency": "IDR",
      "status": "active",
      "owner_user_id": "usr_123",
      "start_date": null,
      "end_date": null,
      "created_at": "2026-04-17T05:00:00Z"
    }
  },
  "meta": {
    "request_id": "req_2"
  }
}
```

### GET `/groups`
List groups/trips for current user.

#### Query params
- `type`: `group|trip` optional
- `status`: `active|archived` optional
- `cursor` optional
- `limit` optional, default 20

### GET `/groups/{group_id}`
Return group detail.

### PATCH `/groups/{group_id}`
Update editable fields.

#### Request
```json
{
  "name": "Bali Villa",
  "description": "Updated description"
}
```

### POST `/groups/{group_id}/archive`
Archive a group/trip.

### POST `/groups/{group_id}/restore`
Restore archived group/trip.

## 7. Memberships

### GET `/groups/{group_id}/members`
Returns active and optionally inactive members.

#### Query params
- `include_inactive`: `true|false`, default `false`

#### Response
```json
{
  "data": {
    "members": [
      {
        "user_id": "usr_123",
        "display_name": "Dwiki",
        "email": "user@example.com",
        "role": "owner",
        "status": "active",
        "joined_at": "2026-04-17T05:00:00Z"
      }
    ]
  },
  "meta": {
    "request_id": "req_3"
  }
}
```

### PATCH `/groups/{group_id}/members/{user_id}`
Update member role/status.

#### Request
```json
{
  "role": "admin"
}
```

### POST `/groups/{group_id}/leave`
Current user leaves group.

### POST `/groups/{group_id}/transfer-ownership`
Transfer ownership.

#### Request
```json
{
  "new_owner_user_id": "usr_456"
}
```

## 8. Invites

### POST `/groups/{group_id}/invites`
Create invite by email.

#### Request
```json
{
  "email": "friend@example.com"
}
```

#### Response
```json
{
  "data": {
    "invite": {
      "id": "inv_123",
      "group_id": "grp_123",
      "email": "friend@example.com",
      "status": "pending",
      "expires_at": "2026-05-17T00:00:00Z",
      "created_at": "2026-04-17T05:10:00Z"
    }
  },
  "meta": {
    "request_id": "req_4"
  }
}
```

### GET `/groups/{group_id}/invites`
List invites for a group.

### GET `/invites`
List pending invites for current user.

#### Query params
- `status`: defaults to `pending`

### POST `/invites/{invite_id}/accept`
Accept invite.

### POST `/invites/{invite_id}/decline`
Decline invite.

### POST `/invites/{invite_id}/revoke`
Revoke invite. Owner/admin only.

## 9. Expenses

### Expense Object
```json
{
  "id": "exp_123",
  "group_id": "grp_123",
  "title": "Dinner",
  "category": "food",
  "notes": "Sushi restaurant",
  "expense_date": "2026-04-16",
  "original_amount_minor": 120000,
  "original_currency": "JPY",
  "base_amount_minor": 1326000,
  "base_currency": "IDR",
  "fx_rate": "11.05",
  "fx_source": "exchangerate_host",
  "split_method": "equal",
  "status": "active",
  "created_by_user_id": "usr_123",
  "created_at": "2026-04-17T05:15:00Z",
  "updated_at": "2026-04-17T05:15:00Z"
}
```

### POST `/groups/{group_id}/expenses`
Create expense.

#### Headers
- `Idempotency-Key: <uuid>` recommended

#### Request
```json
{
  "title": "Dinner",
  "category": "food",
  "notes": "Sushi restaurant",
  "expense_date": "2026-04-16",
  "amount": {
    "minor": 120000,
    "currency": "JPY"
  },
  "paid_by": [
    {
      "user_id": "usr_123",
      "amount_minor": 120000
    }
  ],
  "split_method": "equal",
  "participants": [
    {
      "user_id": "usr_123"
    },
    {
      "user_id": "usr_456"
    },
    {
      "user_id": "usr_789"
    }
  ]
}
```

#### Exact split request example
```json
{
  "title": "Taxi",
  "expense_date": "2026-04-16",
  "amount": {
    "minor": 90000,
    "currency": "IDR"
  },
  "paid_by": [
    {
      "user_id": "usr_123",
      "amount_minor": 90000
    }
  ],
  "split_method": "exact",
  "participants": [
    {
      "user_id": "usr_123",
      "amount_minor": 30000
    },
    {
      "user_id": "usr_456",
      "amount_minor": 60000
    }
  ]
}
```

#### Percentage split request example
```json
{
  "title": "Hotel",
  "expense_date": "2026-04-16",
  "amount": {
    "minor": 1000000,
    "currency": "IDR"
  },
  "paid_by": [
    {
      "user_id": "usr_456",
      "amount_minor": 1000000
    }
  ],
  "split_method": "percentage",
  "participants": [
    {
      "user_id": "usr_123",
      "percentage": "50.00"
    },
    {
      "user_id": "usr_456",
      "percentage": "50.00"
    }
  ]
}
```

#### Response
```json
{
  "data": {
    "expense": {
      "id": "exp_123",
      "group_id": "grp_123",
      "title": "Dinner",
      "category": "food",
      "notes": "Sushi restaurant",
      "expense_date": "2026-04-16",
      "original_amount_minor": 120000,
      "original_currency": "JPY",
      "base_amount_minor": 1326000,
      "base_currency": "IDR",
      "fx_rate": "11.05",
      "fx_source": "exchangerate_host",
      "split_method": "equal",
      "status": "active",
      "paid_by": [
        {
          "user_id": "usr_123",
          "original_paid_amount_minor": 120000,
          "base_paid_amount_minor": 1326000
        }
      ],
      "splits": [
        {
          "user_id": "usr_123",
          "base_owed_amount_minor": 442000
        },
        {
          "user_id": "usr_456",
          "base_owed_amount_minor": 442000
        },
        {
          "user_id": "usr_789",
          "base_owed_amount_minor": 442000
        }
      ],
      "created_at": "2026-04-17T05:15:00Z"
    }
  },
  "meta": {
    "request_id": "req_5"
  }
}
```

### GET `/groups/{group_id}/expenses`
List expenses.

#### Query params
- `cursor`
- `limit`
- `from_date`
- `to_date`
- `created_by_user_id`
- `category`
- `status` default `active`

### GET `/expenses/{expense_id}`
Get expense detail.

### PATCH `/expenses/{expense_id}`
Update expense. Full replace of payer/split structures recommended.

#### Request
```json
{
  "title": "Dinner updated",
  "notes": "Included dessert",
  "participants": [
    {
      "user_id": "usr_123"
    },
    {
      "user_id": "usr_456"
    }
  ]
}
```

### DELETE `/expenses/{expense_id}`
Soft delete expense.

#### Response
`204 No Content`

## 10. Balances

### GET `/groups/{group_id}/balances`
Returns net balances and pairwise obligations.

#### Response
```json
{
  "data": {
    "group_id": "grp_123",
    "base_currency": "IDR",
    "member_balances": [
      {
        "user_id": "usr_123",
        "net_base_amount_minor": 500000
      },
      {
        "user_id": "usr_456",
        "net_base_amount_minor": -300000
      },
      {
        "user_id": "usr_789",
        "net_base_amount_minor": -200000
      }
    ],
    "obligations": [
      {
        "from_user_id": "usr_456",
        "to_user_id": "usr_123",
        "base_amount_minor": 300000
      },
      {
        "from_user_id": "usr_789",
        "to_user_id": "usr_123",
        "base_amount_minor": 200000
      }
    ],
    "updated_at": "2026-04-17T05:20:00Z"
  },
  "meta": {
    "request_id": "req_6"
  }
}
```

### GET `/groups/{group_id}/balances/simplified`
Returns simplified settlement suggestions.

#### Response
```json
{
  "data": {
    "group_id": "grp_123",
    "base_currency": "IDR",
    "suggestions": [
      {
        "from_user_id": "usr_456",
        "to_user_id": "usr_123",
        "base_amount_minor": 300000
      },
      {
        "from_user_id": "usr_789",
        "to_user_id": "usr_123",
        "base_amount_minor": 200000
      }
    ]
  },
  "meta": {
    "request_id": "req_7"
  }
}
```

## 11. Settlements

### POST `/groups/{group_id}/settlements`
Record settlement.

#### Headers
- `Idempotency-Key: <uuid>` recommended

#### Request
```json
{
  "from_user_id": "usr_456",
  "to_user_id": "usr_123",
  "amount": {
    "minor": 300000,
    "currency": "IDR"
  },
  "settlement_date": "2026-04-17",
  "notes": "Bank transfer"
}
```

#### Response
```json
{
  "data": {
    "settlement": {
      "id": "set_123",
      "group_id": "grp_123",
      "from_user_id": "usr_456",
      "to_user_id": "usr_123",
      "original_amount_minor": 300000,
      "original_currency": "IDR",
      "base_amount_minor": 300000,
      "base_currency": "IDR",
      "fx_rate": "1.0",
      "settlement_date": "2026-04-17",
      "notes": "Bank transfer",
      "status": "active",
      "created_by_user_id": "usr_456",
      "created_at": "2026-04-17T05:25:00Z"
    }
  },
  "meta": {
    "request_id": "req_8"
  }
}
```

### GET `/groups/{group_id}/settlements`
List settlements.

#### Query params
- `cursor`
- `limit`
- `from_date`
- `to_date`
- `status`

### GET `/settlements/{settlement_id}`
Get settlement detail.

### DELETE `/settlements/{settlement_id}`
Soft delete settlement.

#### Response
`204 No Content`

## 12. Analytics

### GET `/groups/{group_id}/analytics/summary`
Summary for charts and cards.

#### Query params
- `from_date` optional
- `to_date` optional

#### Response
```json
{
  "data": {
    "group_id": "grp_123",
    "base_currency": "IDR",
    "total_spend_base_minor": 5000000,
    "total_settled_base_minor": 1200000,
    "member_count": 4,
    "expense_count": 18
  },
  "meta": {
    "request_id": "req_9"
  }
}
```

### GET `/groups/{group_id}/analytics/by-member`
```json
{
  "data": {
    "items": [
      {
        "user_id": "usr_123",
        "display_name": "Dwiki",
        "total_paid_base_minor": 3200000,
        "total_owed_base_minor": 1800000,
        "net_base_amount_minor": 1400000
      }
    ]
  },
  "meta": {
    "request_id": "req_10"
  }
}
```

### GET `/groups/{group_id}/analytics/by-category`
```json
{
  "data": {
    "items": [
      {
        "category": "food",
        "total_base_minor": 1200000
      },
      {
        "category": "transport",
        "total_base_minor": 300000
      }
    ]
  },
  "meta": {
    "request_id": "req_11"
  }
}
```

### GET `/groups/{group_id}/analytics/timeline`
#### Query params
- `granularity=day|week|month`

```json
{
  "data": {
    "items": [
      {
        "period_start": "2026-04-01",
        "total_base_minor": 400000
      },
      {
        "period_start": "2026-04-02",
        "total_base_minor": 250000
      }
    ]
  },
  "meta": {
    "request_id": "req_12"
  }
}
```

## 13. Activity Feed

### GET `/groups/{group_id}/activity`
Returns audit/activity feed.

```json
{
  "data": {
    "items": [
      {
        "id": "act_1",
        "action": "expense_created",
        "entity_type": "expense",
        "entity_id": "exp_123",
        "actor_user_id": "usr_123",
        "metadata": {
          "title": "Dinner"
        },
        "created_at": "2026-04-17T05:15:00Z"
      }
    ]
  },
  "meta": {
    "request_id": "req_13"
  }
}
```

## 14. Premium Entitlements

### GET `/entitlements/me`
Returns canonical premium state for current user.

#### Response
```json
{
  "data": {
    "is_premium": true,
    "source": "revenuecat",
    "status": "active",
    "products": [
      {
        "product_id": "splitwise_premium_monthly",
        "entitlement_id": "premium",
        "current_period_ends_at": "2026-05-10T00:00:00Z"
      }
    ],
    "features": {
      "advanced_analytics": true,
      "unlimited_groups": true,
      "receipt_upload": true,
      "export": true
    },
    "updated_at": "2026-04-17T05:30:00Z"
  },
  "meta": {
    "request_id": "req_14"
  }
}
```

### POST `/entitlements/refresh`
Optional recovery endpoint to trigger backend refresh from provider.

#### Response
```json
{
  "data": {
    "is_premium": true,
    "status": "active",
    "updated_at": "2026-04-17T05:31:00Z"
  },
  "meta": {
    "request_id": "req_15"
  }
}
```

## 15. Uploads

### POST `/uploads/receipts/presign`
Generate upload target for receipt image.

#### Notes
- likely premium-gated depending on product rules
- backend returns storage path and signed upload details

#### Request
```json
{
  "group_id": "grp_123",
  "file_name": "receipt.jpg",
  "content_type": "image/jpeg"
}
```

#### Response
```json
{
  "data": {
    "storage_path": "receipts/grp_123/exp_tmp_abc/receipt.jpg",
    "upload": {
      "method": "PUT",
      "url": "https://storage.example.com/...",
      "headers": {
        "content-type": "image/jpeg"
      }
    }
  },
  "meta": {
    "request_id": "req_16"
  }
}
```

## 16. Webhooks

### POST `/webhooks/revenuecat`
Receives RevenueCat events.

#### Requirements
- verify signature/authentication based on provider setup
- deduplicate by event id
- update entitlement state transactionally

#### Expected response
`200 OK`

## 17. Validation Rules

### Expense validation
- `amount.minor > 0`
- `paid_by` must not be empty
- sum of `paid_by.amount_minor` must equal total expense amount in original currency
- `participants` must not be empty
- all referenced users must be active group members
- `split_method=equal` ignores participant amounts and divides server-side
- `split_method=exact` requires participant `amount_minor`
- `split_method=percentage` requires percentages summing to 100.00

### Settlement validation
- amount must be positive
- from and to users must differ
- both users must belong to group

### Invite validation
- normalized email must be valid
- cannot invite existing active member
- cannot create duplicate active pending invite for same group/email

## 18. Pagination Contract
Cursor-based pagination for list endpoints.

### Example
```json
{
  "data": {
    "items": []
  },
  "meta": {
    "next_cursor": "cur_abc",
    "request_id": "req_17"
  }
}
```

## 19. Idempotency Contract
For create-expense and create-settlement endpoints:
- client may send `Idempotency-Key`
- backend stores request hash + response
- repeated identical request returns original response
- repeated different payload with same key returns `409 IDEMPOTENCY_CONFLICT`

## 20. Authorization Matrix (Initial)

| Endpoint | Member | Admin | Owner |
|---|---:|---:|---:|
| Create group | ✅ | ✅ | ✅ |
| Invite member | ✅ | ✅ | ✅ |
| Revoke invite | ❌ | ✅ | ✅ |
| Update group | ❌ | ✅ | ✅ |
| Transfer ownership | ❌ | ❌ | ✅ |
| Add expense | ✅ | ✅ | ✅ |
| Edit own expense | ✅ | ✅ | ✅ |
| Edit any expense | ❌ | ✅ | ✅ |
| Delete own expense | ✅ | ✅ | ✅ |
| Delete any expense | ❌ | ✅ | ✅ |
| Record settlement | ✅ | ✅ | ✅ |
| View analytics | ✅ | ✅ | ✅ |
| Premium-only analytics | gated | gated | gated |

## 21. Open API Decisions
- Whether `/groups` should be named `/containers` to unify trip/group more explicitly
- Whether PATCH on expenses should support partial patch or full replacement of split structures only
- Whether invite accept should also support token-based unauthenticated preview flow later
- Whether entitlement refresh should be user-triggered or internal only
