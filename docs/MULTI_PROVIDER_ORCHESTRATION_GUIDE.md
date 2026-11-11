# Bulk Email: Multi-Provider Orchestration & Intelligent Distribution Guide

## 1. Executive Summary & Architecture Overview

The Bulk Email platform has been restructured and upgraded into an enterprise multi-provider email campaign orchestration system capable of distributing **200,000+ daily eligible deliveries** (~6 million monthly deliveries) across multiple connected email service providers:
- **Amazon SES** (Primary high-volume infrastructure)
- **Brevo** (High-throughput API relay)
- **Mailchimp** (Marketing audience sync & transactional relay)
- **Mock Simulator** (High-performance test fixture for load testing)

```
                       ┌────────────────────────┐
                       │    React Frontend      │
                       │   (Vite / Next.js)     │
                       └───────────┬────────────┘
                                   │ HTTPS REST
                                   ▼
                       ┌────────────────────────┐
                       │   Node/Express API     │
                       │  (Decoupled Web Layer) │
                       └───────────┬────────────┘
                                   │ Enqueue Batch
                                   ▼
                 ┌──────────────────────────────────────┐
                 │       Persistent Message Queue       │
                 │  (PostgreSQL FOR UPDATE SKIP LOCKED  │
                 │          or Amazon SQS)              │
                 └─────────────────┬────────────────────┘
                                   │ Dequeue by Worker ID
                                   ▼
                       ┌────────────────────────┐
                       │   Background Workers   │
                       │  (Independent Cluster) │
                       └─────┬──────┬──────┬────┘
                             │      │      │
            ┌────────────────┘      │      └────────────────┐
            ▼                       ▼                       ▼
┌──────────────────────┐ ┌────────────────────┐ ┌──────────────────────┐
│  Atomic Quota Engine │ │ Multi-Rate Limiter │ │   Safe Failover      │
│  (Two-Phase Leasing) │ │   (Token Buckets)  │ │   Circuit Breaker    │
└───────────┬──────────┘ └──────────┬─────────┘ └───────────┬──────────┘
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             Provider Registry & Adapters               │
       ├──────────────┬───────────────┬────────────┬────────────┤
       │  Amazon SES  │     Brevo     │ Mailchimp  │    Mock    │
       │ (14 msgs/s)  │  (5 msgs/s)   │ (4 msgs/s) │ (50 msgs/s)│
       └──────────────┴───────────────┴────────────┴────────────┘
```

---

## 2. Core Architectural Pillars

### Pillar A: Total Decoupling of Frontend & Delivery
- **Zero bulk loops in HTTP routes**: Frontend requests never initiate sending loops or connect to SMTP.
- **Asynchronous Enqueueing**: Campaigns are converted into persistent `email_jobs` rows streamed in 1,000-recipient chunks using cursor-based streaming.
- **Idempotency Keys**: Every job carries a SHA-256 hash (`campaignId:recipientId:attempt`), preventing duplicate sends during worker crashes or restarts.

### Pillar B: Two-Phase Atomic Quota Leasing
- **Phase 1 (Reserve)**: When a campaign is launched, `QuotaManagerService.reserveQuota()` checks real-time available capacity:
  $$\text{dailyRemaining} = \text{dailyQuota} - \text{dailyUsed} - \text{activeReservations}$$
  It locks the allocation with a 2-hour TTL in `provider_quota_reservations`.
- **Phase 2 (Commit)**: When a worker confirms acceptance by the provider's API, `commitQuota()` atomically increments usage counters and updates the reservation.
- **Rollback / Release**: If jobs fail permanently, cancel, or reassign, `releaseQuota()` immediately liberates uncommitted slots for other campaigns.

### Pillar C: Multi-Provider Token Bucket Rate Limiting
- Independent token bucket for each provider account (e.g. SES @ 14.0/s, Brevo @ 5.0/s, Mailchimp @ 4.0/s).
- Global system throughput cap across all worker threads.
- **Automatic 429 Backoff**: Upstream rate limit responses trigger dynamic cooldowns (default 30s) and token draining to protect account standing.

### Pillar D: 5 Intelligent Routing Strategies
1. **Priority-Based (`PRIORITY`)**: Fills the highest-priority provider (e.g. SES) to its daily limit, then cascades remainder to secondary (Brevo), then tertiary.
2. **Capacity-Based (`CAPACITY`)**: Distributes jobs proportionally across all healthy providers based on available capacity ($C_i / \sum C$).
3. **Cost-Optimized (`COST`)**: Automatically routes jobs to the lowest cost-per-thousand healthy provider first (e.g. $0.10/1,000 before $0.25/1,000).
4. **Manual Split (`MANUAL`)**: Enforces explicit administrator percentage splits (e.g. 70% SES, 30% Brevo).
5. **Hybrid Tiered (`HYBRID`)**: Routes to primary provider up to a designated utilization threshold (e.g. 80%), then balances remainder across secondaries.

### Pillar E: Safe Failover Circuit State Machine
```
[Worker dequeues job] 
        │
        ▼
[Check Suppression List] ─── Suppressed ───► [Ack & Mark SUPPRESSED]
        │
        ▼
[Acquire Token Bucket Permit]
        │
        ▼
[Dispatch to Assigned Provider]
        │
   ┌────┴─────────────────────────────┐
   ▼                                  ▼
[SUCCESS]                         [FAILURE]
   │                                  │
[Commit Quota]                        ├── Permanent (550 / Hard Bounce) ──► [Ack, Suppress Email, Mark REJECTED]
[Ack Job]                             │
[Log Delivery Event]                  └── Transient (429 Rate Limit / 5xx Outage)
                                              │
                                              ▼
                                      [Trigger Cooldown on Provider]
                                      [Check Remaining Retry Budget]
                                              │
                                      ┌───────┴──────────────────────┐
                                      ▼                              ▼
                             [Alternative Healthy]            [No Alternatives]
                                      │                              │
                             [Release Old Lease]              [Nack with Backoff]
                             [Reserve Backup Lease]
                             [Reassign Job Provider]
                             [Immediate Retry Nack]
```

---

## 3. Provider Management REST API Reference

All endpoints are authenticated with JWT Bearer tokens under `/api/v1/providers`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/providers` | Authenticated | List all providers with live capacity and rate statuses |
| `GET` | `/api/v1/providers/:id` | Authenticated | Get detailed metrics and token bucket state for a provider |
| `POST` | `/api/v1/providers` | Admin | Register and connect a new email delivery provider |
| `PATCH` | `/api/v1/providers/:id` | Admin | Update quotas, rates, priorities, credentials, or enabled status |
| `POST` | `/api/v1/providers/:id/test` | Authenticated | Run real-time health check & credential handshake |
| `POST` | `/api/v1/providers/:id/sync-quota` | Authenticated | Reconcile usage counters with provider upstream telemetry |
| `DELETE` | `/api/v1/providers/:id` | Admin | Delete a non-default provider account |

---

## 4. Production Cloud Deployment (AWS ECS / SQS / Docker)

### Environment Variables Configuration

```ini
# Core Backend
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://postgres:PASSWORD@postgres.internal:5432/bulk_email?schema=public
JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_2026
FRONTEND_URL=https://app.yourdomain.com

# Queue Driver: 'database' (PostgreSQL SKIP LOCKED) or 'sqs' (Amazon SQS)
QUEUE_DRIVER=database
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/bulk-email-jobs
AWS_SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/123456789012/bulk-email-dlq

# Amazon SES Production Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
AWS_SES_SOURCE_EMAIL=noreply@yourdomain.com
AWS_SES_CONFIGURATION_SET=bulk-email-events

# Secondary Providers
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILCHIMP_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us19

# Global Worker Concurrency
DEFAULT_MAX_SENDING_RATE=50.0
DEFAULT_WORKER_CONCURRENCY=10
WORKER_PROCESS_COUNT=4
```

### Running Decoupled Background Workers

To run dedicated background worker processes without starting the web HTTP server:
```bash
npm run worker
```
In Docker / ECS:
```bash
docker compose up -d worker --scale worker=4
```

---

## 5. Automated Verification & Benchmark Results

The entire platform is backed by an automated test suite verifying all architectural boundaries:

```
Test Suites: 12 passed, 12 total
Tests:       40 passed, 40 total
Snapshots:   0 total
Time:        23.089 s
```

- **`tests/benchmark.spec.ts`**: 20,000 recipient quota plan and reservation completed in **36ms**; 5,000 concurrent mock dispatches processed and committed to PostgreSQL in **196ms** (>100 msgs/sec).
- **`tests/provider-router.spec.ts`**: Verifies all 5 routing modes (`PRIORITY`, `CAPACITY`, `COST`, `MANUAL`, `HYBRID`) and failover provider selection.
- **`tests/failover.spec.ts`**: Verifies automated failover circuit, quota lease transfer, and deduplication upon simulated 429 rate limit.
- **`tests/provider-api.spec.ts`**: Verifies provider management REST API endpoints and health checks.
- **`tests/multi-rate-limiter.spec.ts`**: Verifies independent provider token buckets and upstream 429 cooldowns.
- **`tests/quota-manager.spec.ts`**: Verifies two-phase leases, over-allocation prevention, and commit/release mechanics.
