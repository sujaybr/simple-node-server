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
  res.json(logs);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
