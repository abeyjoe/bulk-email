# Bulk Email REST API Documentation

Base URL: `http://localhost:4000/api/v1` (or `https://api.yourdomain.com/api/v1`)

All requests except public webhooks, login, and the public unsubscribe portal require:
`Authorization: Bearer <jwt_token>`

---

## 1. Authentication Endpoints

### `POST /auth/login`
Authenticates a user and returns a signed JWT token.

**Request:**
```json
{
  "email": "admin@bulkemail.cloud",
  "password": "AdminSecure2026!"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@bulkemail.cloud",
    "name": "System Administrator",
    "role": "ADMIN",
    "createdAt": "2026-11-10T18:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### `GET /auth/me`
Returns current authenticated user details.

---

## 2. Recipient Management Endpoints

### `GET /recipients`
List and filter recipients.
- Query parameters:
  - `page` (number, default: 1)
  - `limit` (number, default: 25)
  - `search` (string, matches email, name, organisation)
  - `status` (`SUBSCRIBED` | `UNSUBSCRIBED` | `BOUNCED` | `SUPPRESSED`)
  - `listId` (uuid)

### `POST /recipients/import`
High-performance streaming import for 50,000+ recipient CSV / Excel files.

**Request:**
```json
{
  "fileContent": "Email,First Name,Last Name,Company\njohn@example.com,John,Doe,Acme",
  "fileName": "recipients.csv",
  "columnMapping": {
    "email": "Email",
    "firstName": "First Name",
    "lastName": "Last Name",
    "organisation": "Company"
  },
  "listId": "optional-list-uuid",
  "consentSource": "Webinar Signup with Explicit Consent"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "summary": {
    "totalRows": 50000,
    "validRecords": 49200,
    "invalidEmailCount": 350,
    "duplicateCount": 450,
    "suppressedCount": 120,
    "importedCount": 49080,
    "listId": "optional-list-uuid"
  }
}
```

### `GET /recipients/lists` & `POST /recipients/lists`
Create and inspect audience lists / segments.

---

## 3. Campaign Management Endpoints

### `GET /campaigns`
Returns all campaigns.

### `POST /campaigns`
Creates a new campaign draft.

**Request:**
```json
{
  "name": "Q4 Engineering Announcement",
  "subject": "Platform Architecture Updates for {{firstName}}",
  "senderName": "Bulk Email Operations",
  "senderEmail": "noreply@bulkemail.cloud",
  "replyTo": "support@bulkemail.cloud",
  "targetListId": "optional-list-id",
  "htmlContent": "<html><body>Hello {{firstName}}, ...</body></html>",
  "plainTextContent": "Hello {{firstName}}, ...",
  "maxSendingRate": 5.0,
  "bounceThreshold": 5.0,
  "complaintThreshold": 0.1
}
```

### `GET /campaigns/:id/preflight`
Performs pre-campaign validation and returns eligible vs excluded recipient counts before launch.

**Response (200 OK):**
```json
{
  "review": {
    "campaignId": "uuid",
    "campaignName": "Q4 Engineering Announcement",
    "totalRecipients": 50000,
    "eligibleRecipients": 48500,
    "excludedRecipients": 1500,
    "excludedBreakdown": {
      "suppressed": 850,
      "unsubscribed": 420,
      "bounced": 230
    },
    "maxSendingRate": 5.0,
    "bounceThreshold": 5.0,
    "complaintThreshold": 0.1
  }
}
```

### `POST /campaigns/:id/launch`
Initiates asynchronous queuing of campaign jobs. Responds immediately without blocking.

### `POST /campaigns/:id/pause`
Pauses an active campaign dispatch.

### `POST /campaigns/:id/resume`
Resumes a paused campaign.

### `POST /campaigns/:id/cancel`
Cancels campaign and purges pending queue jobs.

### `POST /campaigns/:id/test-send`
Dispatches a sample rendered message to a designated verification email address.

---

## 4. Compliance & Suppression Endpoints

### `GET /compliance/suppression`
List permanent suppression records with search and pagination.

### `POST /compliance/suppression`
Manually add an email to the permanent suppression table.

### `DELETE /compliance/suppression/:email` (Admin only)
Remove an email from suppression.

### `POST /compliance/unsubscribe` (Public)
Public web unsubscribe handler.

### `GET & POST /compliance/unsubscribe/one-click` (Public)
RFC 8058 standard one-click unsubscribe endpoint triggered by email client headers (`List-Unsubscribe=One-Click`).

---

## 5. Webhook Ingestion Endpoint

### `POST /webhooks/ses`
AWS SNS HTTPS webhook endpoint for real-time SES delivery notifications, bounces, and spam complaints. Automatically updates campaign metrics and suppresses hard bounces.
