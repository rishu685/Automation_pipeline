# 🚀 AI-Powered Client Onboarding Dashboard

An automated customer success onboarding pipeline built for founders and operators. This system polls a Notion database for new clients, uses **Gemini 2.5 Flash** to analyze their details and generate personalized welcome emails and team Slack alerts, delivers them via **Resend** and **Slack Webhooks**, and updates Notion when complete.

To maximize simplicity and eliminate dependency issues, the entire pipeline is built using raw python HTTP requests rather than heavy client SDKs, wrapped in a clean **Streamlit** web interface.

---

## 🌟 Key Features

* **Visual Web Console:** Avoid command-line scripts. Run your syncs, inspect live logging, and view AI drafts directly from a clean web interface.
* **API Health Check Panel:** The sidebar validates your connection keys in real-time, helping you troubleshoot missing secrets.
* **Sandbox Simulation Mode:** Test the layout, generated text, Slack alerts, and emails using simulated dry-run details before connecting your live Notion API keys.
* **Smart Database Resolution:** Handles Notion inline databases (by resolving page IDs to database IDs) and dynamic status column types (supporting both `select` and `status` type columns automatically).
* **100% Free Hosting:** Fully compatible with Streamlit Community Cloud (deploys directly from GitHub).

---

## 🛠️ Step-by-Step Installation

### 1. Clone or Copy the Workspace Files
Ensure you have the following files in your project directory:
* `app.py` - Core dashboard application code.
* `requirements.txt` - Python package dependencies.
* `.env` - Credentials file (ignored by Git for safety).

### 2. Install Python Dependencies
Open your terminal inside the project folder and run:
```bash
pip install -r requirements.txt
```

---

## 🔑 API Keys & Credentials Configuration

Create a file named `.env` in the root of your project directory and add the following keys. All services are free and do not require a credit card:

```env
# Gemini API Key (Get from: https://aistudio.google.com/)
GEMINI_API_KEY=your_gemini_api_key_here

# Notion Settings (Create at: https://app.notion.com/developers/tokens)
NOTION_TOKEN=ntn_your_personal_access_token_here
NOTION_DATABASE_ID=your_notion_page_or_database_id_here

# Slack Settings (Create at: https://api.slack.com/apps)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Resend Settings (Get from: https://resend.com/)
RESEND_API_KEY=re_your_resend_api_key_here
SENDER_EMAIL=onboarding@resend.dev
```

### Quick Credentials Guides:
1. **Notion:** Create a Personal Access Token (PAT) at [notion.com/developers](https://app.notion.com/developers/tokens). Your database ID is the 32-character ID in the browser URL of your CRM database page.
2. **Slack:** Create a custom Slack app from scratch, enable **Incoming Webhooks**, click **Add New Webhook**, choose your channel (e.g. `#new-channel`), and copy the URL.
3. **Resend:** Sign up at [resend.com](https://resend.com/), generate a free API key. *Note:* In the sandbox tier, you can only send emails to the email address you signed up with.

---

## 🚀 Running the App

### Running Locally
To launch the dashboard server on your local machine, run:
```bash
streamlit run app.py
```
This will automatically spin up the server and open the app in your browser at **`http://localhost:8501`**.

### ☁️ Free Cloud Deployment (Streamlit Cloud)
To host a live, working link for your team (or newsletter submission):
1. Push this project folder to a GitHub repository.
2. Visit [share.streamlit.io](https://share.streamlit.io/) and log in with your GitHub account.
3. Click **New app**, select your repository, branch, and set main file to `app.py`.
4. Go to **Advanced settings > Secrets** and paste your `.env` key-value configuration.
5. Click **Deploy**! Your app will be live on a public URL in 2 minutes.
