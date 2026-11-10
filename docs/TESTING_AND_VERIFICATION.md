# Testing and Verification Guide

## 1. Running Automated Tests

The platform includes an automated unit and integration test suite covering the queue engine, token-bucket rate limiter, streaming CSV parser, template personalization, and compliance handlers.

Execute tests using:

```bash
cd backend
npm test
```

### Coverage Highlights:
- `tests/csv-parser.spec.ts`: Tests high-throughput streaming CSV parsing, RFC email syntax validation, duplicate email detection, and removal of invalid records.
- `tests/rate-limiter.spec.ts`: Verifies token-bucket rate limiting math, refill timing, and dynamic quota adjustment.
- `tests/template-engine.spec.ts`: Tests personalization tags (`{{firstName}}`, `{{organisation}}`), fallback defaults (`{{firstName|Customer}}`), and mandatory CAN-SPAM physical postal address & unsubscribe footer injection.
- `tests/queue-worker.spec.ts`: Tests persistent PostgreSQL queue row-level locking (`SKIP LOCKED`), batch enqueueing, worker concurrency, and automatic exclusion of suppressed recipients.
- `tests/auth-and-compliance.spec.ts`: Tests password hashing with bcrypt, JWT signing and role-based access control, RFC 8058 `List-Unsubscribe` header generation, and permanent suppression table operations.

---

## 2. Safe Mailbox Simulation (Amazon SES Mailbox Simulator)

In compliance with project specifications, **no uncontrolled bulk emails are dispatched during development or testing**.

The platform incorporates the official Amazon SES Mailbox Simulator:
- `bounce@simulator.amazonses.com`: Simulates a permanent hard bounce (550 5.1.1 unknown user).
- `complaint@simulator.amazonses.com`: Simulates a spam complaint report.
- `ooto@simulator.amazonses.com`: Simulates an out-of-office soft bounce.
- `suppressionlist@simulator.amazonses.com`: Simulates a provider suppression list rejection.
- Standard email addresses: Simulate successful delivery with realistic transit latency and authentic AWS SES Message-ID tokens.

---

## 3. Simulating a 50,000-Recipient Campaign

To verify the platform's ability to handle 50,000 recipients:
1. Create a 50,000-row CSV file using the provided helper:
   ```bash
   cd backend
   npx tsx -e "
   const fs = require('fs');
   const writeStream = fs.createWriteStream('50k_recipients.csv');
   writeStream.write('Email,First Name,Last Name,Company\n');
   for (let i = 1; i <= 50000; i++) {
     writeStream.write('subscriber' + i + '@simulator.amazonses.com,User' + i + ',Doe,Enterprise Ltd\n');
   }
   writeStream.end();
   console.log('Generated 50k_recipients.csv successfully');
   "
   ```
2. In the dashboard, navigate to **Recipients & Lists** &rarr; **Import CSV / Excel**.
3. Select `50k_recipients.csv`, map the columns, and submit.
4. Verify the streaming parser processes all 50,000 rows in batches of 1,000 without blocking the application.
5. Create a campaign targeting this list, review preflight metrics, and click **Approve & Launch Campaign**.
6. Observe the independent background workers processing jobs within the configured global rate limit (e.g. 5-14 messages/second).
