# Production Deployment & DNS Setup Guide

This guide covers deploying **Bulk Email** to dedicated cloud infrastructure (AWS) and configuring custom domain DNS records via Cloudflare.

---

## 1. Domain Architecture

Deploy services across distinct subdomains:

- **Web Application Dashboard:** `https://app.yourdomain.com`
- **Backend API & Webhooks:** `https://api.yourdomain.com`
- **SES Outbound Mail Domain Identity:** `mail.yourdomain.com`

---

## 2. Cloudflare DNS & Email Authentication Records

Configuring email authentication records (SPF, DKIM, DMARC) is mandatory for 99%+ deliverability and inbox placement in Gmail, Yahoo, and Outlook.

### A. SPF (Sender Policy Framework) Record

Add a TXT record for your sending subdomain `mail.yourdomain.com`:

| Type | Name | Value | TTL | Proxy Status |
|---|---|---|---|---|
| `TXT` | `mail` | `v=spf1 include:amazonses.com ~all` | Auto | DNS only (Grey Cloud) |

### B. DKIM (DomainKeys Identified Mail) Records

Amazon SES generates 3 CNAME records with 2048-bit keys:

| Type | Name | Value | Proxy Status |
|---|---|---|---|
| `CNAME` | `[token1]._domainkey.mail` | `[token1].dkim.amazonses.com` | DNS only |
| `CNAME` | `[token2]._domainkey.mail` | `[token2].dkim.amazonses.com` | DNS only |
| `CNAME` | `[token3]._domainkey.mail` | `[token3].dkim.amazonses.com` | DNS only |

### C. DMARC (Domain-based Message Authentication) Record

Add a TXT record at `_dmarc.yourdomain.com`:

| Type | Name | Value | TTL |
|---|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com` | Auto |

### D. MX Record for Custom MAIL FROM Domain

Add an MX record pointing to Amazon SES inbound MTA for bounce handling:

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `mail` | `feedback-smtp.us-east-1.amazonses.com` | 10 |

---

## 3. AWS Production Infrastructure Setup

### Step 1: Managed Database (Amazon RDS PostgreSQL)

1. Create an Amazon RDS PostgreSQL 16 or 17 instance (e.g. `db.t4g.medium` or `db.r6g.large` depending on scale).
2. Enable Multi-AZ deployment for high availability.
3. Apply database connection pooling (`pgbouncer` or AWS RDS Proxy).

### Step 2: Message Queue (Amazon SQS)

1. Create a Standard SQS Queue named `bulk-email-jobs`.
2. Configure **Default Visibility Timeout** to `120 seconds`.
3. Create a Dead-Letter Queue (DLQ) named `bulk-email-jobs-dlq` with a **Maximum Receives** of 5.

### Step 3: Amazon SES Production Access & Configuration Set

1. Request SES Production Mode via the AWS Console (providing use case, opt-in mechanism, and bounce handling architecture).
2. Create an SES Configuration Set named `bulk-email-events`.
3. Add Event Destinations for:
   - Bounces &rarr; Amazon SNS Topic &rarr; HTTPS endpoint `https://api.yourdomain.com/api/v1/webhooks/ses`
   - Complaints &rarr; Amazon SNS Topic &rarr; HTTPS endpoint `https://api.yourdomain.com/api/v1/webhooks/ses`
   - Deliveries &rarr; Amazon SNS Topic &rarr; HTTPS endpoint `https://api.yourdomain.com/api/v1/webhooks/ses`

### Step 4: Container Deployment (AWS ECS with Fargate)

1. Build and push container images to Amazon Elastic Container Registry (ECR):
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
   docker build -t bulk-email-api -f Dockerfile.backend ./backend
   docker tag bulk-email-api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/bulk-email-api:latest
   docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/bulk-email-api:latest
   ```
2. Register ECS Task Definition using `aws/ecs-task-definition.json`.
3. Deploy two ECS Services:
   - **Service 1: `bulk-email-api`** (2+ tasks behind an Application Load Balancer).
   - **Service 2: `bulk-email-workers`** (3-10 tasks scaled based on SQS queue depth).

---

## 4. Local or Single-Server Docker Compose Deployment

For testing or self-hosted deployment:

```bash
# 1. Clone repository
git clone <repo-url>
cd bulk-email

# 2. Configure environment variables in backend/.env
cp backend/.env.example backend/.env

# 3. Launch full stack with Docker Compose
docker compose up -d

# 4. Run database migrations and seed default credentials
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:seed
```

Access the application at `http://localhost:3000`.
Sign in with:
- **Email:** `admin@bulkemail.cloud`
- **Password:** `AdminSecure2026!`
