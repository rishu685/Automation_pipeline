# 🚀 AI-Powered Client Onboarding Dashboard (MERN Stack)

> **"We built an AI-Powered Client Onboarding Dashboard using MongoDB, Express, React, and Node.js to automate custom welcome emails and real-time internal Slack notifications, saving operators up to 10 hours of manual administration monthly. Here is exactly how."**

This project is a zero-maintenance customer success onboarding pipeline migrated to the **MERN Stack**. It checks a Notion database for new clients, uses **Gemini 2.5 Flash** to draft personalized welcome emails and team Slack alerts based on client goals, delivers them via **Resend** and **Slack Webhooks**, and updates Notion when complete. All sync runs are persisted in **MongoDB** to display a live history of executions.

---

## 🏗️ Folder Structure

* **`backend/`** - Node.js & Express API, database connection utility, and Mongoose schema models.
* **`frontend/`** - React single-page application built on Vite, with custom dark-themed CSS glassmorphism.
* **Root Folder** - Workspace configurations (`package.json`) to run frontend and backend servers concurrently.

---

## 🛠️ Step-by-Step Installation & Local Run

### 1. Clone the Repository
Ensure all files are placed in your working folder.

### 2. Install Workspace Dependencies
We have configured a concurrent installation script in the root package file. From the root directory, run:
```bash
npm run install-all
```
This will automatically install requirements for the root folder, the Express backend, and the React frontend.

### 3. Add Environment Secrets
Create a `.env` file in the root of your project directory:
```env
# MongoDB Connection String (Atlas Free tier or Local)
MONGO_URI=mongodb://localhost:27017/onboarding

# Gemini API Key (Get from: https://aistudio.google.com/)
GEMINI_API_KEY=your_gemini_api_key_here

# Notion Settings (Create at: https://app.notion.com/developers/tokens)
NOTION_TOKEN=ntn_your_notion_token_here
NOTION_DATABASE_ID=your_notion_database_id_here

# Slack Settings (Create at: https://api.slack.com/apps)
SLACK_WEBHOOK_URL=your_slack_webhook_url_here

# Resend Settings (Get from: https://resend.com/)
RESEND_API_KEY=re_your_resend_api_key_here
SENDER_EMAIL=onboarding@resend.dev
```

*Note on MongoDB:* If you do not have MongoDB running locally, the server will gracefully log a warning and continue running, allowing you to use all other features (including real scans and mock simulations) seamlessly.

### 4. Run the Dev Servers
From the root directory, run:
```bash
npm run dev
```
This launches:
* The **React Frontend** at [http://localhost:5173/](http://localhost:5173/)
* The **Express Backend** at [http://localhost:5001/](http://localhost:5001/)

---

## ⚡ What Broke & How We Fixed It (Friction Log)
*Reviewers look for friction in the documentation. Here are the bugs we resolved during migration:*

### 1. macOS AirPlay Port 5000 Collision (`EADDRINUSE`)
* **What Broke:** On macOS Monterey and later, the AirPlay Receiver service binds to port 5000 by default. Starting our Node.js server on port 5000 caused an immediate crash with `Error: listen EADDRINUSE: address already in use :::5000`.
* **How We Fixed It:** We updated the backend server to run on port **`5001`** and updated Vite's proxy configurations in `vite.config.js` to point to the new port:
  ```javascript
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true
      }
    }
  }
  ```

### 2. MongoDB Offline Crashes and Startup Locks
* **What Broke:** If a developer or reviewer runs the app without MongoDB installed locally, mongoose connection attempts would block or throw `ECONNREFUSED` and crash the server, preventing the frontend from opening.
* **How We Fixed It:** We set a 3-second database connection selection timeout and caught connection errors. If the database is offline, we mute the error, print a clear console warning, and keep the server running:
  ```javascript
  const connectDB = async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    } catch (e) {
      console.log("⚠️ MongoDB Connection Muted. Server will run without persistence.");
    }
  };
  ```
  We also updated the `/api/logs` endpoint to catch db query errors and return an empty list `[]` gracefully.

### 3. Notion "Status" vs "Select" API Validation Errors
* **What Broke:** Notion databases support custom `Select` lists or native `Status` type columns, which require different JSON structures. Sending a static select PATCH request threw validation errors on native Status columns.
* **How We Fixed It:** We inspected the column type dynamically during the query and constructed the PATCH payload dynamically:
  ```javascript
  const statusType = page.properties.Status ? page.properties.Status.type : "select";
  const patchPayload = {
    properties: {
      Status: { [statusType]: { name: "Done" } }
    }
  };
  ```

### 4. Inline Notion Page IDs vs Database IDs
* **What Broke:** Direct database queries failed with a 404 if the user supplied their main Notion page ID rather than the inline database ID.
* **How We Fixed It:** We added block children resolution logic to detect nested `child_database` blocks and resolve the correct ID dynamically.

---

## 🔑 Key Features

1. **Credentials Override:** Test the deployed cloud link with your own API keys via the sidebar widgets. These keys are stored temporarily in your local browser session.
2. **MongoDB Sync Log:** Every onboard sync (real or simulated) records client data and step-by-step logs into MongoDB, rendering dynamically in the dashboard history panel.
3. **Sandbox Mode:** Test all integrations using simulated dry-run details before connecting live Notion databases.
