# Bulk Email Administrator Manual

## 1. Accessing the Platform

1. Navigate to the web application URL (`http://localhost:3000` or `https://app.yourdomain.com`).
2. Log in using your assigned credentials:
   - **Administrator Account:** `admin@bulkemail.cloud` (Default Password: `AdminSecure2026!`)
   - **Campaign Manager Account:** `manager@bulkemail.cloud` (Default Password: `ManagerSecure2026!`)

---

## 2. Managing Recipient Audiences

### A. Importing Large Subscriber Lists (50,000+ Records)
1. Navigate to **Recipients & Lists** in the left navigation sidebar.
2. Click **Import CSV / Excel**.
3. Select your `.csv` or `.xlsx` spreadsheet file.
4. The system automatically reads the spreadsheet header row and detects matching columns:
   - **Email:** The column containing recipient email addresses.
   - **First Name:** Optional column for `{{firstName}}` personalization.
   - **Last Name:** Optional column for `{{lastName}}` personalization.
   - **Organisation:** Optional column for `{{organisation}}` personalization.
5. Select a target recipient list / segment (optional).
6. Check the **CAN-SPAM & Data Protection Compliance Declaration** confirming verified consent.
7. Click **Start Asynchronous Import**.
8. The streaming engine parses and chunks records into the database in batches of 1,000 without freezing the web application. Duplicate addresses within the file and previously suppressed addresses are automatically filtered out.

---

## 3. Creating and Launching a Campaign

1. Navigate to **Create Campaign**.
2. Fill in:
   - **Campaign Name:** Internal descriptive identifier.
   - **Email Subject:** Subject line (supports variables, e.g. `Platform updates for {{firstName}}`).
   - **Sender Name & Email:** Verified identity (e.g. `Bulk Email Operations <noreply@bulkemail.cloud>`).
   - **Target Audience:** Select an audience segment or choose all registered recipients.
3. Use the **HTML Editor** or load a pre-built template from the template library.
4. Use the **Insert Variable** chips to personalize content (`{{firstName}}`, `{{organisation}}`, `{{unsubscribeUrl}}`).
5. Click **Live Rendering Preview** to preview how the email will render on desktop and mobile screens.
6. Adjust the **Sending Rate & Safety Circuit Breakers**:
   - **Max Sending Rate:** Recommended starting value is 2-5 messages/sec.
   - **Bounce Circuit Breaker:** Recommended threshold is 5.0%.
   - **Complaint Circuit Breaker:** Recommended threshold is 0.10%.
7. Click **Save & Prepare Campaign**.

---

## 4. Preflight Review and Approval

Before any campaign enters active delivery, the platform enforces a **Preflight Campaign Review**:
1. Locate the campaign in the **Campaigns** table and click the **Launch (Play)** button.
2. The modal displays:
   - **Eligible to Send:** Clean, valid recipients who are opted in.
   - **Excluded Prior to Launch:** Hard-bounced, unsubscribed, or blacklisted addresses automatically excluded before queuing.
3. Review the summary and click **Approve & Launch Campaign**.

---

## 5. Monitoring & Circuit Breakers

1. While the campaign is running, the **Executive Operations Dashboard** tracks real-time progress:
   - **Accepted by Provider:** Messages successfully handed off to Amazon SES API.
   - **Confirmed Delivered:** Final delivery confirmed by recipient MTA via SES notifications.
   - **Bounce Rate & Complaint Rate:** Tracked against safety limits.
2. If the hard bounce rate reaches 5% or the complaint rate reaches 0.1%, the **Automated Circuit Breaker** immediately pauses campaign dispatch, stops worker queue consumption, and records an incident alert on the dashboard.
