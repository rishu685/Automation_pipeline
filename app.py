import os
import json
import time
import requests
import streamlit as st
from dotenv import load_dotenv

# Load environment variables (from .env file locally)
load_dotenv()

# App Configuration
st.set_page_config(
    page_title="AI Client Onboarding Automation",
    page_icon="🚀",
    layout="wide"
)

# Default environment credentials
default_gemini = os.getenv("GEMINI_API_KEY") or ""
default_notion_token = os.getenv("NOTION_TOKEN") or ""
default_notion_database_id = os.getenv("NOTION_DATABASE_ID") or ""
default_slack_webhook_url = os.getenv("SLACK_WEBHOOK_URL") or ""
default_resend_api_key = os.getenv("RESEND_API_KEY") or ""
default_sender_email = os.getenv("SENDER_EMAIL", "onboarding@resend.dev")

# Sidebar Configuration for Custom API Keys Override
st.sidebar.header("🔑 Custom API Keys Configuration")
st.sidebar.info("To test this dashboard with your own workspace, enter your keys below. They are saved temporarily in your browser session and will override default system credentials.")

GEMINI_API_KEY = st.sidebar.text_input("Gemini API Key", value=default_gemini, type="password", help="Enter a free API key from Google AI Studio")
NOTION_TOKEN = st.sidebar.text_input("Notion Token", value=default_notion_token, type="password", help="Personal Access Token starting with ntn_")
NOTION_DATABASE_ID = st.sidebar.text_input("Notion Database ID (or Page ID)", value=default_notion_database_id, help="32-character ID from your database page URL")
SLACK_WEBHOOK_URL = st.sidebar.text_input("Slack Webhook URL", value=default_slack_webhook_url, help="Slack webhook URL starting with https://hooks.slack.com/")
RESEND_API_KEY = st.sidebar.text_input("Resend API Key", value=default_resend_api_key, type="password", help="API key starting with re_")
SENDER_EMAIL = st.sidebar.text_input("Sender Email Address", value=default_sender_email, help="Defaults to onboarding@resend.dev (Sandbox)")

# Sidebar Integration Health Check
st.sidebar.write("---")
st.sidebar.subheader("🏥 Integration Health Check")

credentials = {
    "Gemini API": GEMINI_API_KEY,
    "Notion Token": NOTION_TOKEN,
    "Notion Database ID": NOTION_DATABASE_ID,
    "Slack Webhook": SLACK_WEBHOOK_URL,
    "Resend API": RESEND_API_KEY
}

all_configured = True
for name, val in credentials.items():
    if val:
        st.sidebar.success(f"🟢 {name} active")
    else:
        st.sidebar.error(f"🔴 {name} missing")
        all_configured = False


# Helper to inspect properties dynamically
def get_property_value(page, prop_name):
    properties = page.get("properties", {})
    prop = properties.get(prop_name, {})
    if not prop:
        return ""
    
    prop_type = prop.get("type")
    if prop_type == "title":
        title_list = prop.get("title", [])
        return "".join([x.get("plain_text", "") for x in title_list]) if title_list else ""
    elif prop_type == "rich_text":
        text_list = prop.get("rich_text", [])
        return "".join([x.get("plain_text", "") for x in text_list]) if text_list else ""
    elif prop_type == "email":
        return prop.get("email") or ""
    elif prop_type == "select":
        sel = prop.get("select")
        return sel.get("name", "") if sel else ""
    elif prop_type == "status":
        stat = prop.get("status")
        return stat.get("name", "") if stat else ""
    return ""

# Automation Functions
def fetch_pending_clients(log_container):
    log_container.info("🔍 Querying Notion database...")
    
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }
    
    db_id = NOTION_DATABASE_ID
    
    # Check if the ID provided is a database. If not, try to resolve it from the page blocks.
    test_url = f"https://api.notion.com/v1/databases/{db_id}"
    try:
        test_response = requests.get(test_url, headers=headers)
        log_container.info(f"Test URL: {test_url} -> Status {test_response.status_code}")
        if test_response.status_code != 200:
            # Try fetching children blocks of the page
            log_container.info("Checking if database is inline on a page...")
            blocks_url = f"https://api.notion.com/v1/blocks/{db_id}/children"
            blocks_response = requests.get(blocks_url, headers=headers)
            log_container.info(f"Blocks URL: {blocks_url} -> Status {blocks_response.status_code}")
            if blocks_response.status_code == 200:
                blocks = blocks_response.json().get("results", [])
                log_container.info(f"Found {len(blocks)} blocks on parent page.")
                for block in blocks:
                    log_container.info(f"Block: Type={block.get('type')}, ID={block.get('id')}")
                    if block.get("type") == "child_database":
                        db_id = block["id"]
                        log_container.info(f"📌 Automatically resolved inline database ID: {db_id}")
                        break
    except Exception as e:
        log_container.warning(f"Failed database resolution check: {str(e)}")

    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    log_container.info(f"Querying Database URL: {url}")
    
    # We poll all pages and filter in Python to be robust against Notion property type configurations
    try:
        response = requests.post(url, headers=headers, json={})
        log_container.info(f"Query Response Status: {response.status_code}")
        if response.status_code != 200:
            log_container.error(f"❌ Notion API returned status {response.status_code}: {response.text}")
            return []
        
        pages = response.json().get("results", [])
        log_container.info(f"📊 Notion returned {len(pages)} total rows.")
        pending_clients = []
        
        for page in pages:
            name = get_property_value(page, "Name")
            status = get_property_value(page, "Status")
            log_container.info(f"Found row: Name='{name}', Status='{status}'")
            
            # We match 'Pending' or 'Pending Onboard' or 'Not started' (case-insensitive)
            if status and any(x in status.lower() for x in ["pending", "not started"]):
                client_info = {
                    "id": page["id"],
                    "name": name,
                    "email": get_property_value(page, "Email"),
                    "company": get_property_value(page, "Company"),
                    "notes": get_property_value(page, "Notes"),
                    "status_type": page.get("properties", {}).get("Status", {}).get("type", "select")
                }
                pending_clients.append(client_info)
        
        log_container.success(f"✅ Found {len(pending_clients)} clients pending onboarding.")
        return pending_clients
        
    except Exception as e:
        log_container.error(f"❌ Failed to fetch clients from Notion: {str(e)}")
        return []

def generate_onboarding_content(client, log_container):
    log_container.info(f"🧠 Asking Gemini to generate personalized onboarding content for {client['name']}...")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
    You are an expert customer success manager. Your task is to onboard a new client based on their details.
    
    Client Details:
    - Name: {client['name']}
    - Company: {client['company']}
    - Email: {client['email']}
    - Onboarding Notes/Goals: {client['notes']}
    
    Draft two things:
    1. A personalized, warm, and professional onboarding email to the client from their account manager. Mention their company and their specific goals/onboarding notes. Use HTML format (with paragraphs, bold text, etc., but keep it modern, clean, and styled).
    2. An internal Slack notification alert for the team. Keep it brief, friendly, use Slack markdown (like *bold*, _italics_, emojis), summarize who the client is, their main goal, and suggest 3 action items for the team.
    
    Respond strictly in JSON format matching this schema:
    {{
      "welcome_email_subject": "Subject line...",
      "welcome_email_body": "HTML body...",
      "slack_message": "Slack message..."
    }}
    """
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            log_container.error(f"❌ Gemini API returned error: {response.text}")
            return None
        
        result_json = response.json()
        text_content = result_json["candidates"][0]["content"]["parts"][0]["text"]
        content = json.loads(text_content)
        log_container.success(f"✅ Onboarding content generated successfully by Gemini.")
        return content
    except Exception as e:
        log_container.error(f"❌ Failed to generate content via Gemini: {str(e)}")
        return None

def send_slack_notification(message, log_container):
    log_container.info("💬 Dispatching Slack channel notification...")
    
    headers = {"Content-Type": "application/json"}
    payload = {"text": message}
    
    try:
        response = requests.post(SLACK_WEBHOOK_URL, headers=headers, json=payload)
        if response.status_code in [200, 201]:
            log_container.success("✅ Slack notification delivered successfully!")
            return True
        else:
            log_container.error(f"❌ Slack API returned error: {response.text}")
            return False
    except Exception as e:
        log_container.error(f"❌ Failed to send Slack notification: {str(e)}")
        return False

def send_welcome_email(email_address, subject, html_body, log_container):
    log_container.info(f"✉️ Sending welcome email to {email_address} via Resend...")
    
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "from": f"Onboarding Team <{SENDER_EMAIL}>",
        "to": [email_address],
        "subject": subject,
        "html": html_body
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code in [200, 201]:
            log_container.success(f"✅ Welcome email sent to {email_address}!")
            return True
        else:
            log_container.error(f"❌ Resend API returned error: {response.text}")
            return False
    except Exception as e:
        log_container.error(f"❌ Failed to send email via Resend: {str(e)}")
        return False

def update_notion_status(page_id, status_type, log_container):
    log_container.info("🔄 Updating Notion onboarding status to 'Done'...")
    
    url = f"https://api.notion.com/v1/pages/{page_id}"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }
    
    # Construct update payload dynamically based on property type (select vs status)
    payload = {
        "properties": {
            "Status": {
                status_type: {
                    "name": "Done"
                }
            }
        }
    }
    
    try:
        response = requests.patch(url, headers=headers, json=payload)
        if response.status_code == 200:
            log_container.success("✅ Notion row updated successfully!")
            return True
        else:
            log_container.error(f"❌ Notion patch failed: {response.text}")
            return False
    except Exception as e:
        log_container.error(f"❌ Failed to update Notion status: {str(e)}")
        return False

# Web Application UI
st.markdown("<h1 style='text-align: center;'>🚀 AI Client Onboarding Dashboard</h1>", unsafe_allow_html=True)
st.markdown("<p style='text-align: center; color: gray;'>Automate client onboarding using Notion, Gemini AI, Slack, and Resend.</p>", unsafe_allow_html=True)
st.markdown("---")

# Configurations are resolved globally in the sidebar above.

# Layout tabs
tab_dash, tab_setup = st.tabs(["Dashboard & Operations", "Step-by-Step Setup Guide"])

with tab_dash:
    col_left, col_right = st.columns([1, 2])
    
    with col_left:
        st.subheader("Control Center")
        st.write("Trigger onboarding scans or run dry runs to test integrations.")
        
        # Primary Action
        run_btn = st.button("🔍 Scan & Onboard Clients", type="primary", disabled=not all_configured)
        if not all_configured:
            st.warning("⚠️ Complete the configuration in your `.env` file to scan Notion.")
            
        st.write("---")
        st.subheader("🧪 Sandbox dry run (No APIs needed)")
        st.write("Don't have your API keys ready yet? Try a simulated run with mock client details.")
        
        mock_btn = st.button("🏃 Run Mock Simulation")
        
    with col_right:
        st.subheader("Execution Logs")
        log_area = st.empty()
        
        if run_btn:
            log_area.empty()
            drafts_container = st.container()
            with st.status("Running onboarding workflow...", expanded=True) as status:
                # 1. Fetch pending clients
                clients = fetch_pending_clients(status)
                
                if not clients:
                    status.warning("No pending clients found in Notion.")
                    st.info("💡 Make sure you have rows in your Notion database with Status set to 'Pending' or 'Not Started'.")
                else:
                    for client in clients:
                        drafts_container.subheader(f"Processing client: {client['name']} ({client['company']})")
                        
                        # 2. Generate content via Gemini
                        content = generate_onboarding_content(client, status)
                        if not content:
                            continue
                            
                        # Show what Gemini drafted
                        with drafts_container.expander(f"View drafted items for {client['name']}", expanded=False):
                            st.write("**Slack Message Draft:**")
                            st.code(content["slack_message"])
                            st.write("**Email Draft:**")
                            st.write(content["welcome_email_body"], unsafe_allow_html=True)
                        
                        # 3. Send Slack update
                        slack_success = send_slack_notification(content["slack_message"], status)
                        
                        # 4. Send Email
                        email_success = send_welcome_email(
                            client["email"],
                            content["welcome_email_subject"],
                            content["welcome_email_body"],
                            status
                        )
                        
                        # 5. Update Notion
                        if slack_success and email_success:
                            update_notion_status(client["id"], client["status_type"], status)
                            st.toast(f"Successfully onboarded {client['name']}!")
                        else:
                            status.error(f"❌ Skipping Notion update for {client['name']} due to delivery failures.")
                    
                    status.update(label="Workflow completed!", state="complete", expanded=False)
                    
        elif mock_btn:
            log_area.empty()
            with st.status("Simulating onboarding dry run...", expanded=True) as status:
                mock_client = {
                    "id": "mock-page-123",
                    "name": "Jane Miller",
                    "email": "jane@example.com",
                    "company": "GrowthCraft Co.",
                    "notes": "Building a custom SaaS platform. Target launch date: August 1st. Main concern: scaling API endpoints."
                }
                
                status.info(f"Mock Client: {mock_client['name']} from {mock_client['company']}")
                time.sleep(1)
                
                status.info("🧠 Generative AI is drafting onboarding assets...")
                time.sleep(1.5)
                
                mock_email_subject = "Welcome to GrowthCraft Co.! Let's Scale Together."
                mock_email_body = f"""
                <div style='font-family: sans-serif; padding: 20px; line-height: 1.6;'>
                    <h3>Hi Jane,</h3>
                    <p>Thrilled to welcome <b>{mock_client['company']}</b> on board! We saw you're working toward an <b>August 1st</b> launch.</p>
                    <p>Regarding scaling your API endpoints, our senior architects will prioritize this in our kickoff call.</p>
                </div>
                """
                mock_slack = f"📢 *New Client Onboarded!*\n👤 *Name:* {mock_client['name']}\n🏢 *Company:* {mock_client['company']}\n💡 *Goal:* Launch SaaS by Aug 1st\n\n🛠️ *Assigned tasks:*\n1. Review backend API schema\n2. Setup kick-off invite\n3. Provision database"
                
                status.success("✅ Generative content drafted by AI mockup.")
                
                # Render draft visualizer
                with st.expander("Preview generated onboarding items (Click to expand)", expanded=True):
                    st.write("**Generated Slack Ping:**")
                    st.code(mock_slack)
                    st.write("**Generated Welcome Email:**")
                    st.html(mock_email_body)
                
                status.info("💬 Delivering Slack alert to internal channel...")
                # If webhook is configured, actually deliver it!
                if SLACK_WEBHOOK_URL:
                    send_slack_notification(mock_slack, status)
                else:
                    time.sleep(1)
                    status.success("✅ Slack ping delivered (simulated)")
                    
                status.info("✉️ Sending welcome email to client...")
                # If Resend key is configured, try sending to sandbox!
                if RESEND_API_KEY:
                    send_welcome_email(mock_client["email"], mock_email_subject, mock_email_body, status)
                else:
                    time.sleep(1)
                    status.success("✅ Welcome email delivered (simulated)")
                    
                status.info("🔄 Checking off onboarding state in Notion...")
                time.sleep(1)
                status.success("✅ Database row status changed to 'Onboarded'!")
                
                status.update(label="Simulation complete!", state="complete", expanded=False)
                st.balloons()
        else:
            st.info("👈 Choose an action from the control panel to begin.")

with tab_setup:
    st.subheader("Step-by-Step Setup Guide")
    st.write("Follow these steps to wire up the automation in your own workspace:")
    
    st.markdown("""
    ### 1. Notion Setup
    1. Create a Notion database with these exact column properties (Case-sensitive):
       - **Name** (Title type) - *The client's name*
       - **Email** (Email type) - *The client's contact email*
       - **Company** (Rich text or Select type) - *The client's company name*
       - **Notes** (Rich text type) - *Goals, concerns, timelines*
       - **Status** (Select or Status type) - Add two options: `Pending Onboard` and `Onboarded`. Set new clients to `Pending Onboard`.
    2. Visit [notion.so/my-integrations](https://www.notion.so/my-integrations), create a new integration, and copy your **Internal Integration Token**.
    3. Open your database in Notion, click the three dots (`...`) in the top-right, go to **Connect to**, find your integration, and approve it.
    4. Copy your **Database ID** from the database URL: `https://www.notion.so/{database_id}?v=...`
    
    ### 2. Gemini AI Key
    1. Go to [Google AI Studio](https://aistudio.google.com/).
    2. Sign in with a Google account and click **Get API key**.
    3. Copy the key and place it under `GEMINI_API_KEY` in your settings.
    
    ### 3. Slack Webhook Setup
    1. Go to [Slack API Console](https://api.slack.com/apps).
    2. Create a new App from scratch, select your workspace.
    3. Click **Incoming Webhooks** and activate them.
    4. Scroll down, click **Add New Webhook to Workspace**, select the target channel, and copy the Webhook URL.
    
    ### 4. Resend Email Setup
    1. Sign up for a free account at [Resend](https://resend.com/).
    2. Go to **API Keys** and generate an API key.
    3. *Note:* If using the free sandbox tier, you can only send emails to your own registration email address. To send to clients, verify your custom domain in Resend.
    
    ### 5. Deployment Guide (Streamlit Cloud - 100% Free)
    1. Push this folder to a GitHub repository.
    2. Sign up on [Streamlit Share](https://share.streamlit.io/) using your GitHub account.
    3. Click **New app**, select your repository, branch, and set main file to `app.py`.
    4. Click **Advanced settings**, and in the **Secrets** text box, paste your environment variables like this:
       ```toml
       GEMINI_API_KEY = "AIzaSy..."
       NOTION_TOKEN = "ntn_..."
       NOTION_DATABASE_ID = "..."
       SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/..."
       RESEND_API_KEY = "re_..."
       SENDER_EMAIL = "onboarding@resend.dev"
       ```
    5. Click **Deploy**! Your app will be live on a public URL in 2 minutes.
    """)
