# Bulk Email | Enterprise Campaign & Delivery Platform

**Bulk Email** is a high-throughput bulk email management platform architected to distribute large email campaigns (50,000 to 500,000+ recipients) through external cloud delivery infrastructure (Amazon SES) while protecting domain reputation, preventing server overloads, and strictly complying with CAN-SPAM and international data privacy regulations.

---

## 1. Architectural Highlights

- **Decoupled Asynchronous Engine:** Web application and background email workers operate as separate, independently scalable services.
- **Persistent Message Queue:** Backed by Amazon SQS (production) and PostgreSQL durable queue with row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`).
- **Global Rate Limiter:** Centralized token-bucket rate limiter enforces an account-wide sending quota (default: 2–5 msgs/sec up to 14 msgs/sec) across all concurrent workers.
- **Streaming Parser (50,000+ Records):** Non-blocking CSV and XLSX parser processes tens of thousands of records in chunks of 1,000 with deduplication and email format validation.
- **Automated Anti-Abuse Circuit Breaker:** Dispatches are paused immediately if hard bounces reach 5.0% or spam complaints reach 0.10%.
- **Permanent Suppression System:** Automatic exclusion of hard bounces, spam complaints, and RFC 8058 one-click unsubscribes prior to enqueueing.
- **Amazon SES Mailbox Simulator:** Built-in simulation provider guarantees zero uncontrolled bulk sends during testing.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM |
| **Database** | PostgreSQL 17 |
| **Message Queue** | Amazon SQS / PostgreSQL Persistent Queue |
| **Workers** | Independent Worker Processes (`worker-runner.js`) / AWS ECS Fargate |
| **Email Delivery** | Amazon SES API v2 (`@aws-sdk/client-sesv2`) |
| **Authentication** | JWT with Role-Based Access Control (`ADMIN`, `MANAGER`, `VIEWER`) |
| **Containers** | Docker, Docker Compose, AWS ECS Task Definitions |

---

## 3. Quick Start (Local Development)

### Prerequisites
- Node.js v20+ and npm
- PostgreSQL 16 or 17 (running locally on port 5432 or 5433)

### Installation

```bash
# 1. Backend Setup
cd backend
npm install
npm run db:push
npm run db:seed
npm test

# 2. Frontend Setup
cd ../frontend
npm install
npm run build
```

### Running the Services

```bash
# Start Backend API & Embedded Worker (Port 4000)
cd backend
npm run dev

# Start Frontend Development Server (Port 3000)
cd ../frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

**Default Login Credentials:**
- **Administrator:** `admin@bulkemail.cloud` / `AdminSecure2026!`
- **Campaign Manager:** `manager@bulkemail.cloud` / `ManagerSecure2026!`

---

## 4. Documentation Directory

- [Architecture & Lessons Learned](docs/ARCHITECTURE_AND_LESSONS_LEARNED.md): Detailed comparison against the previous suspended Namecheap setup.
- [Production Deployment Guide](docs/DEPLOYMENT_GUIDE.md): AWS ECS Fargate, RDS, SQS, SES, and Cloudflare DNS setup (SPF, DKIM, DMARC).
- [API Documentation](docs/API_DOCUMENTATION.md): Complete REST endpoint reference.
- [Administrator Manual](docs/ADMINISTRATOR_MANUAL.md): User guide for recipient imports, campaign authoring, and monitoring.
- [Testing & Verification](docs/TESTING_AND_VERIFICATION.md): Test suite execution and safe SES mailbox simulator usage.

---

## 5. License

Proprietary & Confidential. All rights reserved.
