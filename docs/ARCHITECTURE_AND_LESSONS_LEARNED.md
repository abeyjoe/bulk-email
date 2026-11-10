# Architectural Design & Lessons Learned

## 1. Post-Mortem Analysis of Namecheap Suspension

The previous bulk email application suffered a catastrophic suspension from Namecheap shared hosting. According to the official suspension notice:

1. **Massive mail queue buildup on local host:** Tens of thousands of emails were placed directly into local mail transfer agent (MTA) queues on a shared server.
2. **Excessive concurrent SMTP connections:** The frontend web request initiated an unbounded delivery loop that opened thousands of simultaneous outbound TCP connections on ports 25, 465, or 587.
3. **Synchronous single-request architecture:** Processing 50,000 recipients inside a single HTTP request led to worker exhaustion, memory spikes, and timeout cascades.
4. **No global rate limiting or throttling:** Dispatches were attempted at line-speed without regard for receiving ISP limits or shared infrastructure quotas.
5. **Absence of automated suppression and circuit breakers:** High bounce rates and spam reports went unmonitored until the hosting provider halted the entire account.

---

## 2. Architectural Comparison: Old vs. New Architecture

| Dimension | Previous Failed Architecture | **New "Bulk Email" Platform Architecture** |
|---|---|---|
| **Delivery Infrastructure** | Shared web-host SMTP | **Amazon Simple Email Service (SES) API** |
| **Connection Protocol** | Direct TCP SMTP sockets | **HTTPS REST API (`@aws-sdk/client-sesv2`)** |
| **Execution Flow** | Synchronous HTTP request loop | **Fully Asynchronous Persistent Queue (Amazon SQS / PostgreSQL `SKIP LOCKED`)** |
| **Web Server Decoupling** | Monolithic frontend + delivery | **Web App and Background Workers run on separate processes / containers** |
| **Concurrency Control** | Unbounded (thousands of threads) | **Configurable worker concurrency (default 4-5 per worker)** |
| **Rate Limiting** | None (dispatched at line rate) | **Centralized Token-Bucket Global Rate Limiter across all workers** |
| **Large Recipient Handling** | Loaded 50k into server memory | **Streaming CSV / XLSX parser with chunked batching (1,000 per chunk)** |
| **Suppression & Blacklists** | No automated suppression | **Permanent Suppression Table (Hard Bounces, Complaints, RFC 8058 Unsubscribes)** |
| **Anti-Abuse Circuit Breaker** | None | **Automated Campaign Pause if Bounce Rate &ge; 5% or Complaint &ge; 0.1%** |
| **Idempotency & Retries** | Duplicate sends on timeout | **Deterministic Idempotency Keys + Exponential Backoff with Jitter** |

---

## 3. High-Level Decoupled Architecture

```mermaid
flowchart TD
    subgraph Client [Browser / Admin Console]
        Admin[Administrator / Manager]
        UI[React / Next.js Dashboard]
    end

    subgraph AppTier [Application Tier]
        API[Node.js Express / NestJS Backend API]
        Auth[RBAC & JWT Auth Guard]
        Parser[Streaming CSV/XLSX Parser (50k+)]
    end

    subgraph DataTier [Persistence & Queuing Tier]
        DB[(PostgreSQL 17 Database)]
        Queue[[Amazon SQS / Persistent Queue]]
        DLQ[[Dead-Letter Queue (DLQ)]]
    end

    subgraph WorkerTier [Decoupled Background Workers]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker N]
        Limiter[Shared Token-Bucket Rate Limiter]
        CircuitBreaker[Reputation Circuit Breaker]
    end

    subgraph ProviderTier [Email Delivery Infrastructure]
        SES[Amazon SES API v2]
        SNS[Amazon SNS Notification Topic]
    end

    subgraph Receivers [External Recipients]
        Recipients[Individual Inboxes]
    end

    Admin --> UI
    UI --> API
    API --> Auth
    API --> Parser
    Parser --> DB
    API --> DB

    API -.->|Batch Enqueue| Queue
    Queue --> W1
    Queue --> W2
    Queue --> W3
    W1 <--> Limiter
    W2 <--> Limiter
    W3 <--> Limiter
    W1 -.-> CircuitBreaker

    W1 -->|SES API Call| SES
    W2 -->|SES API Call| SES
    W3 -->|SES API Call| SES

    W1 -.->|Max Retries Exceeded| DLQ

    SES --> Recipients
    SES -->|Bounces / Complaints / Deliveries| SNS
    SNS -->|Webhook Notification| API
    API -->|Auto-Suppress / Update Stats| DB
```

---

## 4. Non-Negotiable Technical Requirements Compliance

1. **Never use shared hosting SMTP for bulk email delivery:** Outbound dispatches strictly utilize Amazon SES API or authenticated external provider API. Local hosting server SMTP is never invoked.
2. **Never establish thousands of simultaneous SMTP connections:** Workers invoke HTTP API calls with strict concurrency pools (default 4 per worker).
3. **Never send 50,000 emails synchronously through a single HTTP request:** The campaign initiation API responds in milliseconds with status `QUEUING`. Background streaming jobs process in chunks of 1,000.
4. **Never allow frontend requests to directly initiate email delivery loops:** The frontend only triggers state transitions; background worker tasks independently consume from the queue.
5. **Separate the web application from the background email processing infrastructure:** Workers can be deployed on dedicated AWS ECS/Fargate tasks or isolated worker runner containers.
6. **Use a persistent message queue and independently managed background workers:** Supported via Amazon SQS or PostgreSQL `FOR UPDATE SKIP LOCKED` durable queue.
7. **Implement global sending-rate controls, concurrency limits and automatic throttling:** Centralized token-bucket rate limiter ensures system dispatch rate never exceeds account quotas.
8. **Implement bounce, complaint and unsubscribe processing:** Real-time SNS webhook handler immediately adds hard bounces and complainants to `suppression_records`.
9. **Automatically pause campaigns when safety thresholds are breached:** Automated circuit breaker halts campaign dispatch if bounce rate &ge; 5% or complaint rate &ge; 0.1%.
