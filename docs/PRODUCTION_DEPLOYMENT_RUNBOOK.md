# Production Deployment & Operational Runbook
## Multi-Provider Bulk Email Orchestration Platform (200,000 Daily Scale)

---

### 1. Cloud Architecture & Infrastructure Topology

The Bulk Email platform is decoupled into independently scalable tiers to guarantee that bulk outbound delivery cannot degrade web application availability, and shared hosting SMTP is never used.

```
                              [ CUSTOM DOMAIN: yourdomain.com ]
                                             |
                                  [ Cloudflare DNS & WAF ]
                                             |
                   +-------------------------+-------------------------+
                   | (Frontend Web Traffic)                            | (API Traffic)
                   v                                                   v
           [ Vercel Edge CDN ]                           [ AWS Application Load Balancer ]
       (React 18 / Vite Dashboard)                                     |
                                                      +----------------+----------------+
                                                      |                                 |
                                                      v                                 v
                                           [ ECS Fargate: Web API ]          [ RDS PostgreSQL 17 ]
                                          - Auth & RBAC (JWT/bcrypt)         - Multi-Provider Schema
                                          - 5-Mode Allocation Engine         - Two-Phase Quota Leases
                                          - Streaming CSV/XLSX Parser        - Permanent Suppression List
                                                      |
                                                      v
                                        [ Amazon SQS FIFO Queue ]
                                         (Deduplicated Job Queue)
                                         (Dead-Letter Queue - DLQ)
                                                      |
                                                      v
                                       [ ECS Fargate: Worker Fleet ]
                                       - Scalable 2 -> 20 Fargate Pods
                                       - Per-Provider Token Throttling
                                       - Safe Failover State Machine
                                                      |
                     +--------------------------------+--------------------------------+
                     |                                |                                |
                     v                                v                                v
              [ Amazon SES ]                      [ Brevo ]                      [ Mailchimp ]
          (Primary Delivery Tier)         (Secondary Spillover Tier)       (Audience / Campaign Sync)
```

---

### 2. Domain & DNS Authentication Setup

To achieve 99%+ inbox deliverability and prevent ISP spam flagging, configure the following DNS records on your domain registrar or Cloudflare:

#### A. Sender Policy Framework (SPF)
Add a `TXT` record at the root or mail subdomain:
- **Type:** `TXT`
- **Name:** `mail.yourdomain.com` (or `@` if sending from root)
- **Value:** `v=spf1 include:amazonses.com include:spf.brevo.com ~all`

> [!NOTE]
> Never include Namecheap shared hosting SMTP in your SPF record (`include:namecheap.com` or `v=spf1 +a +mx`). Outbound bulk emails must originate exclusively from verified cloud providers.

#### B. DomainKeys Identified Mail (DKIM)
In the Amazon SES and Brevo dashboards, generate Easy DKIM 2048-bit CNAME records:
- **SES CNAME 1:** `token1._domainkey.yourdomain.com` -> `token1.dkim.amazonses.com`
- **SES CNAME 2:** `token2._domainkey.yourdomain.com` -> `token2.dkim.amazonses.com`
- **SES CNAME 3:** `token3._domainkey.yourdomain.com` -> `token3.dkim.amazonses.com`
- **Brevo CNAME:** `mail._domainkey.yourdomain.com` -> `mail.domainkey.brevo.com`

#### C. Domain-based Message Authentication (DMARC)
Publish a DMARC policy record to protect domain reputation and receive aggregate reports:
- **Type:** `TXT`
- **Name:** `_dmarc.yourdomain.com`
- **Value:** `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-forensic@yourdomain.com; sp=quarantine; aspf=r; adkim=r`

#### D. MX Records (Incoming Mail / Return-Path)
For Amazon SES custom return-path:
- **Type:** `MX`
- **Name:** `mail.yourdomain.com`
- **Value:** `feedback-smtp.us-east-1.amazonses.com` (Priority 10)

---

### 3. AWS Infrastructure Deployment (CloudFormation)

The platform includes a dedicated, least-privilege CloudFormation template in [`aws/cloudformation-template.yml`](file:///c:/Users/abeyj/Desktop/bulk-email/aws/cloudformation-template.yml).

#### Step 1: Store Production Secrets in AWS Secrets Manager
```bash
# 1. Store PostgreSQL Database URL
aws secretsmanager create-secret \
  --name "bulk-email/production/db" \
  --secret-string "postgresql://postgres_admin:SecurePassword2026@bulk-email-db.crxxx.us-east-1.rds.amazonaws.com:5432/bulk_email?schema=public&sslmode=require"

# 2. Store Cryptographically Strong JWT Secret
aws secretsmanager create-secret \
  --name "bulk-email/production/jwt" \
  --secret-string "production_super_strong_cryptographic_jwt_secret_bulk_email_2026_xyz"
```

#### Step 2: Build & Push Docker Image to Amazon ECR
```bash
# 1. Authenticate Docker with Amazon ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# 2. Create ECR Repository (if not already created)
aws ecr create-repository --repository-name bulk-email-api --region us-east-1

# 3. Build & Tag Multi-Provider Image
docker build -t bulk-email-api:latest -f Dockerfile.backend ./backend
docker tag bulk-email-api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/bulk-email-api:latest

# 4. Push Image
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/bulk-email-api:latest
```

#### Step 3: Deploy CloudFormation Stack
```bash
aws cloudformation deploy \
  --template-file aws/cloudformation-template.yml \
  --stack-name bulk-email-production \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    EnvironmentName=production \
    VpcId=vpc-0123456789abcdef0 \
    SubnetIds=subnet-0123456789abcdef0,subnet-0123456789abcdef1 \
    ContainerImageUri=123456789012.dkr.ecr.us-east-1.amazonaws.com/bulk-email-api:latest \
    DatabaseUrlSecretArn=arn:aws:secretsmanager:us-east-1:123456789012:secret:bulk-email/production/db-xxxx \
    JwtSecretSecretArn=arn:aws:secretsmanager:us-east-1:123456789012:secret:bulk-email/production/jwt-xxxx \
    AlertEmailAddress=ops-team@yourdomain.com
```

#### Step 4: Run Database Migrations & Baseline Seed
Execute the Prisma migration runner from a one-off ECS Fargate task or bastion:
```bash
npm run db:migrate
npm run db:seed
```

---

### 4. Vercel Frontend Deployment

1. **Connect Repository to Vercel:**
   - Link the Git repository in the Vercel Dashboard.
   - Set **Root Directory** to `frontend`.
   - **Framework Preset:** `Vite`.
   - **Build Command:** `npm run build`.
   - **Output Directory:** `dist`.

2. **Configure Environment Variables in Vercel:**
   - `VITE_API_URL`: Set to `/api` (or custom backend domain `https://api.yourdomain.com`).

3. **Verify Routing Configuration:**
   - The [`frontend/vercel.json`](file:///c:/Users/abeyj/Desktop/bulk-email/frontend/vercel.json) file automatically handles SPA deep routes (`/campaigns/:id`, `/providers`) and sets enterprise security headers (`HSTS`, `nosniff`, `DENY`).

---

### 5. Production Preflight Audit Execution

Before launching live campaigns, run the automated production preflight script:

```bash
npm --prefix backend run preflight:prod
```

Expected diagnostic output:
```
================================================================
🔍 BULK EMAIL MULTI-PROVIDER PRODUCTION PREFLIGHT AUDIT
================================================================

| Category     | Component / Check                | Status | Details
|--------------|----------------------------------|--------|----------------------------------------------------
| Security     | JWT Secret Strength              | ✅ PASS | Cryptographically strong secret configured.
| Database     | PostgreSQL Connectivity          | ✅ PASS | Connected successfully. Users: 2, Recipients: 7, Campaigns: 6
| Database     | Suppression List Health          | ✅ PASS | Suppression registry active with 12 entries.
| Providers    | Amazon SES Production Account     | ✅ PASS | Quota: 0/50,000 daily | Rate: 14 msg/s | Cost: $0.1/k
| Providers    | Brevo High-Throughput API         | ✅ PASS | Quota: 0/40,000 daily | Rate: 5 msg/s | Cost: $0.25/k
| Providers    | Mailchimp Audience Sync          | ✅ PASS | Quota: 0/10,000 daily | Rate: 4 msg/s | Cost: $1/k
| Providers    | Combined Fleet Capacity          | ✅ PASS | Combined Daily Quota: 300,000 (0 used). Target: 200,000/day.
| Queue        | Amazon SQS FIFO Engine           | ✅ PASS | Configured. Main: bulk-email-production-jobs.fifo | DLQ: dlq.fifo
| Architecture | Decoupled Worker Isolation       | ✅ PASS | Web API is completely decoupled from background worker processes.

================================================================
✅ ALL PREFLIGHT CHECKS PASSED: SYSTEM FULLY READY FOR 200,000 RECIPIENT CAMPAIGNS!
================================================================
```

---

### 6. Safe Pilot Send Verification Runbook

To safely verify end-to-end delivery prior to a 50,000+ recipient campaign:

1. **Log in to the Platform:**
   - Navigate to `https://app.yourdomain.com` (or `http://localhost:3000`).
   - Sign in with administrator credentials (`admin@bulkemail.cloud`).

2. **Verify Provider Fleet Status:**
   - Go to **Provider Fleet** (`/providers`).
   - Click **Test Handshake** on each connected provider to confirm API credentials and network latency.
   - Click **Sync Quota** to fetch live telemetry from provider endpoints.

3. **Create Pilot Recipient List:**
   - Upload a small CSV with 3–5 internal test addresses across major mailbox providers (Gmail, Microsoft 365, Yahoo, corporate domain).

4. **Launch Pilot Campaign:**
   - Go to **Create Campaign** (`/campaigns/new`).
   - Select routing strategy (e.g. `PRIORITY` or `CAPACITY`).
   - Review the preflight allocation preview (showing provider slot distribution and estimated USD cost).
   - Click **Launch Campaign**.

5. **Inspect Live Delivery Headers:**
   - In the recipient inbox, open the test email and inspect raw headers:
     - `Authentication-Results`: Verify `spf=pass`, `dkim=pass`, and `dmarc=pass`.
     - `List-Unsubscribe`: Verify presence of RFC 8058 one-click unsubscribe headers (`<https://app.yourdomain.com/api/unsubscribe/...>`, `<mailto:...>`).
     - `List-Unsubscribe-Post`: Verify `List-Unsubscribe=One-Click`.

6. **Verify Analytics & Spend:**
   - On the **Campaign Detail** screen (`/campaigns/:id`), verify:
     - 100% acceptance rate.
     - Provider breakdown attributing delivery to the expected tier.
     - Quota meter decremented accurately with zero over-allocation.

---

### 7. Namecheap Hosting Protection Guarantees

To ensure Namecheap shared hosting suspension never recurs, the following safeguards are hardcoded into the platform:

| Risk Factor | Legacy Failure Cause | Multi-Provider Solution |
|---|---|---|
| **Outbound Connection Port** | Thousands of SMTP connections to port 25/465/587 on shared host | **Strict REST API only.** Workers use HTTPS port 443 to SES, Brevo, and Mailchimp official APIs. Shared hosting SMTP is completely bypassed. |
| **Request Concurrency** | Frontend HTTP route executed synchronous `for` loops across all recipients | **Persistent Queue (SQS/DB).** Campaign creation inserts jobs in < 50ms and returns immediately. Background workers pull jobs in batches of 10–50. |
| **Worker Process Location** | Background scripts spawned on Namecheap shared cPanel server | **Decoupled Cloud Workers.** Workers run exclusively on AWS ECS Fargate or dedicated Docker containers. Namecheap host is never touched. |
| **Rate Limit Violations** | Blasting emails at uncontrolled speeds triggering ISP blocks | **Token-Bucket Throttling.** Each provider is bounded by its approved `perSecondRateLimit` (e.g., SES 14/s, Brevo 5/s) with a global safety ceiling. |
| **Reputation Circuit Breaker** | Continued sending into high bounces, causing domain blacklisting | **Automatic Halt.** If bounce rate hits 5% or complaint rate hits 0.1%, campaign instantly pauses and notifies admins via SNS/Email. |
| **Idempotency & Deduplication** | Worker retries caused duplicate emails sent to recipients | **SHA-256 Idempotency Key.** Unique constraint `(campaignId, recipientId, attempt)` prevents duplicate dispatches at the database engine level. |
