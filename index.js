import express from "express";
import cors from "cors";
import helmet from "helmet";

import { PostHog } from 'posthog-node'

const app = express();
const PORT = process.env.PORT || 3000;

const ph = new PostHog(
  process.env['POST_HOG_KEY'],
  { host: 'https://us.i.posthog.com' }
);
const logs = [];

app.use(cors());
app.use(helmet());

app.get("/", (req, res) => {
  console.log("GET / - Health check");
  res.send("OK");
});

app.get("/ph/:project/:tag/:extra?", (req, res) => {
  const { project, tag, extra } = req.params;

  try {
    ph.capture({
      distinctId: 'default-user',
      event: tag,
      properties: { 
        project: project, 
        tag: tag, 
        extra: extra || null 
      }
    });

    logs.push({
      timestamp: new Date().toISOString(),
      project,
      tag,
      extra: extra || null
    });

    console.log(`PostHog event, tag: '${tag}', project: '${project}', extra: '${extra || "N/A"}'`);
    res.send("DONE");
  } catch (error) {
    console.error(`Error tracking event in PostHog: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/logs", (req, res) => {
  let html = `
    <html>
      <head>
        <title>Event Logs</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>Event Logs</h1>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Project</th>
              <th>Tag</th>
              <th>Extra</th>
            </tr>
          </thead>
          <tbody>
  `;

  logs.forEach(log => {
    html += `
      <tr>
        <td>${log.timestamp}</td>
        <td>${log.project}</td>
        <td>${log.tag}</td>
        <td>${log.extra ?? ""}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </body>
    </html>
  `;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
