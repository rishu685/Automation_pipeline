const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("./config/db");
const SyncLog = require("./models/SyncLog");

const app = express();

// Connect to Database (Optional: doesn't crash server if fail, but log it)
connectDB();

app.use(cors());
app.use(express.json());

// Helper to extract properties dynamically
function getPropertyValue(page, propName) {
  const properties = page.properties || {};
  const prop = properties[propName];
  if (!prop) return "";
  
  const type = prop.type;
  if (type === "title") {
    return prop.title ? prop.title.map(x => x.plain_text).join("") : "";
  } else if (type === "rich_text") {
    return prop.rich_text ? prop.rich_text.map(x => x.plain_text).join("") : "";
  } else if (type === "email") {
    return prop.email || "";
  } else if (type === "select") {
    return prop.select ? prop.select.name : "";
  } else if (type === "status") {
    return prop.status ? prop.status.name : "";
  }
  return "";
}

// 1. GET API Config Status (Check which env keys are defined)
app.get("/api/config", (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    notionToken: !!process.env.NOTION_TOKEN,
    notionDb: !!process.env.NOTION_DATABASE_ID,
    slack: !!process.env.SLACK_WEBHOOK_URL,
    resend: !!process.env.RESEND_API_KEY
  });
});

// 2. GET Previous Sync Logs
app.get("/api/logs", async (req, res) => {
  try {
    const logs = await SyncLog.find().sort({ onboardedAt: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    console.log("⚠️ Could not fetch logs from MongoDB:", error.message);
    res.json([]);
  }
});

// 3. POST Real Onboard Run
app.post("/api/onboard", async (req, res) => {
  const executionLogs = [];
  const logInfo = (msg) => {
    console.log(msg);
    executionLogs.push(msg);
  };

  // Keys can be overridden via payload request body, falling back to process.env
  const GEMINI_API_KEY = req.body.geminiApiKey || process.env.GEMINI_API_KEY;
  const NOTION_TOKEN = req.body.notionToken || process.env.NOTION_TOKEN;
  let NOTION_DATABASE_ID = req.body.notionDatabaseId || process.env.NOTION_DATABASE_ID;
  const SLACK_WEBHOOK_URL = req.body.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
  const RESEND_API_KEY = req.body.resendApiKey || process.env.RESEND_API_KEY;
  const SENDER_EMAIL = req.body.senderEmail || process.env.SENDER_EMAIL || "onboarding@resend.dev";

  if (!GEMINI_API_KEY || !NOTION_TOKEN || !NOTION_DATABASE_ID || !SLACK_WEBHOOK_URL || !RESEND_API_KEY) {
    return res.status(400).json({
      success: false,
      error: "Missing credentials. Make sure environment variables or overrides are supplied."
    });
  }

  logInfo("🔍 Querying Notion database...");
  const notionHeaders = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  try {
    // 3a. Resolve Database ID if Page ID was supplied
    try {
      const dbCheckRes = await axios.get(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}`, { headers: notionHeaders });
      logInfo(`Test URL status: ${dbCheckRes.status}`);
    } catch (e) {
      logInfo("Checking if database is inline on page blocks...");
      const blocksUrl = `https://api.notion.com/v1/blocks/${NOTION_DATABASE_ID}/children`;
      const blocksResponse = await axios.get(blocksUrl, { headers: notionHeaders });
      if (blocksResponse.status === 200) {
        const blocks = blocksResponse.data.results || [];
        for (const block of blocks) {
          if (block.type === "child_database") {
            NOTION_DATABASE_ID = block.id;
            logInfo(`📌 Resolved inline database ID: ${NOTION_DATABASE_ID}`);
            break;
          }
        }
      }
    }

    // 3b. Query Database
    const queryUrl = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
    logInfo(`Querying Database URL: ${queryUrl}`);
    
    const queryResponse = await axios.post(queryUrl, {}, { headers: notionHeaders });
    if (queryResponse.status !== 200) {
      throw new Error(`Notion API query failed with code ${queryResponse.status}`);
    }

    const pages = queryResponse.data.results || [];
    logInfo(`📊 Notion returned ${pages.length} total rows.`);

    const pendingClients = [];
    for (const page of pages) {
      const name = getPropertyValue(page, "Name");
      const status = getPropertyValue(page, "Status");
      logInfo(`Found row: Name='${name}', Status='${status}'`);

      if (status && (status.toLowerCase().includes("pending") || status.toLowerCase().includes("not started"))) {
        pendingClients.push({
          id: page.id,
          name,
          email: getPropertyValue(page, "Email"),
          company: getPropertyValue(page, "Company"),
          notes: getPropertyValue(page, "Notes"),
          statusType: page.properties.Status ? page.properties.Status.type : "select"
        });
      }
    }

    logInfo(`✅ Found ${pendingClients.length} clients pending onboarding.`);

    if (pendingClients.length === 0) {
      return res.json({
        success: true,
        onboardedCount: 0,
        logs: executionLogs
      });
    }

    let onboardedCount = 0;

    for (const client of pendingClients) {
      logInfo(`Processing client: ${client.name} (${client.company})`);
      
      // 3c. Generate Gemini Welcome Materials
      logInfo(`🧠 Asking Gemini to generate personalized onboarding content for ${client.name}...`);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      const prompt = `
        You are an expert customer success manager. Your task is to onboard a new client based on their details.
        
        Client Details:
        - Name: ${client.name}
        - Company: ${client.company}
        - Email: ${client.email}
        - Onboarding Notes/Goals: ${client.notes}
        
        Draft two things:
        1. A personalized, warm, and professional onboarding email to the client from their account manager. Mention their company and their specific goals/onboarding notes. Use HTML format (with paragraphs, bold text, etc., but keep it modern, clean, and styled).
        2. An internal Slack notification alert for the team. Keep it brief, friendly, use Slack markdown (like *bold*, _italics_, emojis), summarize who the client is, their main goal, and suggest 3 action items for the team.
        
        Respond strictly in JSON format matching this schema:
        {
          "welcome_email_subject": "Subject line...",
          "welcome_email_body": "HTML body...",
          "slack_message": "Slack message..."
        }
      `;

      const geminiPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      };

      let geminiResponse;
      try {
        geminiResponse = await axios.post(geminiUrl, geminiPayload, { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        logInfo(`❌ Gemini API call failed: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
        continue;
      }

      if (geminiResponse.status !== 200) {
        logInfo(`❌ Gemini API error status ${geminiResponse.status}`);
        continue;
      }

      const textContent = geminiResponse.data.candidates[0].content.parts[0].text;
      const content = JSON.parse(textContent);
      logInfo("✅ Onboarding content generated successfully by Gemini.");

      // 3d. Send Slack Notification
      logInfo("💬 Dispatching Slack channel notification...");
      let slackSuccess = false;
      try {
        const slackRes = await axios.post(SLACK_WEBHOOK_URL, { text: content.slack_message }, { headers: { "Content-Type": "application/json" } });
        if (slackRes.status === 200 || slackRes.status === 201) {
          logInfo("✅ Slack notification delivered successfully!");
          slackSuccess = true;
        } else {
          logInfo(`❌ Slack webhook failed with status: ${slackRes.status}`);
        }
      } catch (err) {
        logInfo(`❌ Failed to deliver Slack webhook: ${err.message}`);
      }

      // 3e. Send Welcome Email via Resend
      logInfo(`✉️ Sending welcome email to ${client.email} via Resend...`);
      let emailSuccess = false;
      try {
        const resendUrl = "https://api.resend.com/emails";
        const resendPayload = {
          from: `Onboarding Team <${SENDER_EMAIL}>`,
          to: [client.email],
          subject: content.welcome_email_subject,
          html: content.welcome_email_body
        };
        const resendRes = await axios.post(resendUrl, resendPayload, {
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          }
        });
        if (resendRes.status === 200 || resendRes.status === 201) {
          logInfo(`✅ Welcome email sent to ${client.email}!`);
          emailSuccess = true;
        }
      } catch (err) {
        logInfo(`❌ Failed to send email via Resend: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
      }

      // 3f. Update Notion Page Status to "Done"
      let notionSuccess = false;
      if (slackSuccess && emailSuccess) {
        logInfo("🔄 Updating Notion onboarding status to 'Done'...");
        try {
          const patchUrl = `https://api.notion.com/v1/pages/${client.id}`;
          const patchPayload = {
            properties: {
              Status: {
                [client.statusType]: { name: "Done" }
              }
            }
          };
          const patchRes = await axios.patch(patchUrl, patchPayload, { headers: notionHeaders });
          if (patchRes.status === 200) {
            logInfo("✅ Notion row updated successfully!");
            notionSuccess = true;
            onboardedCount++;
          }
        } catch (err) {
          logInfo(`❌ Notion status update failed: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
        }
      } else {
        logInfo(`❌ Skipping Notion update for ${client.name} due to delivery failure.`);
      }

      // 3g. Save Log in MongoDB
      try {
        await SyncLog.create({
          clientName: client.name,
          clientCompany: client.company,
          clientEmail: client.email,
          notes: client.notes,
          status: notionSuccess ? "success" : "failed",
          slackSent: slackSuccess,
          emailSent: emailSuccess,
          logs: executionLogs
        });
      } catch (err) {
        console.error("Failed to write sync log to DB:", err.message);
      }
    }

    res.json({
      success: true,
      onboardedCount,
      logs: executionLogs
    });

  } catch (error) {
    logInfo(`❌ Process encountered error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      logs: executionLogs
    });
  }
});

// 4. POST Sandbox Mock Simulation (No credentials needed)
app.post("/api/mock-onboard", async (req, res) => {
  const executionLogs = [];
  const logInfo = (msg) => {
    console.log(msg);
    executionLogs.push(msg);
  };

  const client = {
    name: "Jane Miller",
    email: "jane@example.com",
    company: "GrowthCraft Co.",
    notes: "Building a custom SaaS platform. Target launch date: August 1st. Main concern: scaling API endpoints."
  };

  logInfo("Simulating onboarding dry run...");
  logInfo(`Mock Client: ${client.name} from ${client.company}`);
  logInfo("🧠 Generative AI (Gemini 2.5) is drafting welcome email and Slack announcement...");
  
  const mockEmailBody = `
    <div style='font-family: sans-serif; padding: 20px; line-height: 1.6;'>
      <h3>Hi Jane,</h3>
      <p>Thrilled to welcome <b>${client.company}</b> on board! We saw you're working toward an <b>August 1st</b> launch.</p>
      <p>Regarding scaling your API endpoints, our senior architects will prioritize this in our kickoff call.</p>
    </div>
  `;
  const mockSlack = `📢 *New Client Onboarded!*\n👤 *Name:* ${client.name}\n🏢 *Company:* ${client.company}\n💡 *Goal:* Launch SaaS by Aug 1st\n\n🛠️ *Assigned tasks:*\n1. Review backend API schema\n2. Setup kick-off invite\n3. Provision database`;

  logInfo("✅ Generative content drafted by AI mockup.");
  logInfo("💬 Delivering Slack alert to internal channel (simulated)...");
  
  // If user has slack webhook, let's actually deliver to their webhook as a cool feature!
  const SLACK_WEBHOOK_URL = req.body.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (SLACK_WEBHOOK_URL) {
    try {
      await axios.post(SLACK_WEBHOOK_URL, { text: mockSlack }, { headers: { "Content-Type": "application/json" } });
      logInfo("✅ Slack notification delivered to webhook!");
    } catch (err) {
      logInfo("❌ Slack notification delivery failed.");
    }
  } else {
    logInfo("✅ Slack notification delivered successfully (simulated)!");
  }

  logInfo("✉️ Sending welcome email to client (simulated)...");
  logInfo("✅ Welcome email delivered successfully (simulated)!");
  logInfo("🔄 Checking off onboarding state in Notion (simulated)...");
  logInfo("✅ Database row status changed to 'Done'!");
  logInfo("Simulation complete!");

  // Write log to database
  try {
    await SyncLog.create({
      clientName: client.name,
      clientCompany: client.company,
      clientEmail: client.email,
      notes: client.notes,
      status: "simulated",
      slackSent: true,
      emailSent: true,
      logs: executionLogs
    });
  } catch (err) {
    console.error("Failed to write mock log to DB:", err.message);
  }

  res.json({
    success: true,
    logs: executionLogs
  });
});

// Serve frontend in production (optional static bundle)
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Node Server running on http://localhost:${PORT}`);
});
