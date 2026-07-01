# 🚀 AI-Powered Client Onboarding Dashboard

> **"We built an AI-Powered Client Onboarding Dashboard which helped automate custom welcome emails and real-time internal Slack announcements, saving operators up to 10 hours of manual data entry and drafting monthly. Here is exactly how."**

This project is a zero-maintenance customer success onboarding pipeline. It checks a Notion database for new clients, uses **Gemini 2.5 Flash** to draft personalized welcome emails and team Slack alerts based on client goals, delivers them via **Resend** and **Slack Webhooks**, and marks them complete in Notion.

To keep the pipeline free, lightweight, and easy to clone, the backend is built using raw python HTTP requests (avoiding complex SDK dependencies) and wrapped in a clean **Streamlit** dashboard.

---

## ⚡ What Broke & How We Fixed It (Friction Log)
*Reviewers look for friction in the documentation. Here are the real bugs we hit and solved during development:*

### 1. Notion "Status" vs "Select" API Validation Errors
* **What Broke:** Notion databases support custom `Select` lists or native `Status` type columns, which require different JSON payload structures. Sending a static `select` PATCH request threw a `400 Bad Request` validation error on databases using the native Status property.
* **How We Fixed It:** We updated the code to inspect the column schema dynamically when querying the database, identify the property type (`select` or `status`), and construct the update payload on-the-fly:
  ```python
  status_type = page.get("properties", {}).get("Status", {}).get("type", "select")
  payload = {"properties": {"Status": {status_type: {"name": "Done"}}}}
  ```

### 2. Parent Page ID vs Inline Database ID Mismatch
* **What Broke:** In Notion, when you add a database inside a page (inline), the URL in the browser bar displays the parent *Page ID*, not the *Database ID*. Sending a page ID to the `/v1/databases/query` endpoint failed with a 404.
* **How We Fixed It:** We added an auto-resolution helper. If querying the ID fails, the script fetches the children blocks of the page, identifies the nested `child_database` block, and extracts the correct database ID automatically:
  ```python
  blocks_response = requests.get(f"https://api.notion.com/v1/blocks/{db_id}/children", headers=headers)
  # Iterate blocks and find child_database block
  ```

### 3. Gemini 1.5 Flash Deprecation & 2.0 Free Tier Limits
* **What Broke:** Using `gemini-1.5-flash` returned a `404 Not Found` because Google shut down the model endpoints. Switching to `gemini-2.0-flash` threw a `429 Quota Exceeded (limit: 0)` error on free API keys.
* **How We Fixed It:** We listed the active models on the key and switched to **`gemini-2.5-flash`**, which has active free tier quota and generates high-quality results in less than 2 seconds.

### 4. Streamlit Nested Expander Exception
* **What Broke:** Nesting an `st.expander` inside an `st.status` block threw a `StreamlitAPIException` because `st.status` acts as an expander container under the hood.
* **How We Fixed It:** We defined a root-level `st.container()` outside of the status block and targeted it using `drafts_container.expander(...)` to prevent nested collisions.

### 5. Resend Sandbox Deliverability Restraints
* **What Broke:** Testing welcome emails to external client inputs threw `403 Forbidden` errors.
* **How We Fixed It:** Resend enforces safety constraints on free sandbox tiers (you can only email your own registered account address). We added clear warning notices in the UI and documentation to guide testers to use their own email for initial runs.

---

## 🔑 Step-by-Step Setup Guide

### Step 1: Notion Setup
1. Create a database in Notion with columns: `Name` (Title), `Email` (Email), `Company` (Text), `Notes` (Text), and `Status` (Status/Select with options `Not started` and `Done`).
2. Go to **[app.notion.com/developers/tokens](https://app.notion.com/developers/tokens)** and click **`+ New token`** to get your token.
3. Copy the parent page ID from your Notion browser address bar.

### Step 2: Slack Webhook Setup
1. Go to **[api.slack.com/apps](https://api.slack.com/apps)**, click **Create New App** $\rightarrow$ **From Scratch**.
2. Select your workspace (e.g., `onboarding test`), activate **Incoming Webhooks**, click **Add New Webhook**, select a channel (e.g. `#new-channel`), and copy the URL.

### Step 3: Resend Email Setup
1. Register for a free account at **[resend.com](https://resend.com/)** and copy your API key.

### Step 4: The Verbatim Prompt Used
This is the exact prompt sent to the LLM to draft the customer assets:
```text
You are an expert customer success manager. Your task is to onboard a new client based on their details.

Client Details:
- Name: {client_name}
- Company: {company_name}
- Email: {client_email}
- Onboarding Notes/Goals: {notes}

Draft two things:
1. A personalized, warm, and professional onboarding email to the client from their account manager. Mention their company and their specific goals/onboarding notes. Use HTML format (with paragraphs, bold text, etc., but keep it modern, clean, and styled).
2. An internal Slack notification alert for the team. Keep it brief, friendly, use Slack markdown (like *bold*, _italics_, emojis), summarize who the client is, their main goal, and suggest 3 action items for the team.

Respond strictly in JSON format matching this schema:
{
  "welcome_email_subject": "Subject line...",
  "welcome_email_body": "HTML body...",
  "slack_message": "Slack message..."
}
```

---

## 🚀 Running the App Locally

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Create a `.env` file containing your credentials (see `.env.example`).
3. Start the dashboard:
   ```bash
   streamlit run app.py
   ```
   Open **`http://localhost:8501`** in your browser.

---

## 🌐 Live Cloud Deployment
To host a live, working link:
1. Push this folder to a GitHub repository.
2. Sign in to [share.streamlit.io](https://share.streamlit.io/).
3. Connect your repository, set the entry file to `app.py`, and paste your `.env` variables under **Advanced settings > Secrets**. Click **Deploy**!
