import express from "express";
import cors from "cors";
import helmet from "helmet";

import Mixpanel from "mixpanel";
import { PostHog } from 'posthog-node'

const app = express();
const PORT = process.env.PORT || 3000;

const mp = Mixpanel.init(process.env["MIX_PANEL_KEY"]);
const ph = new PostHog(
  process.env['POST_HOG_KEY'],
  { host: 'https://us.i.posthog.com' }
);

app.use(cors());
app.use(helmet());

app.get("/", (req, res) => {
  console.log("GET / - Health check");
  res.send("OK");
});

app.get("/mp/:project/:tag/:extra?", (req, res) => {
  const { project, tag, extra } = req.params;

  mp.track(tag, {
    distinct_id: 'default-user',
    project: project,
    tag: tag,
    extra: extra || null,
  });

  console.log(`Mixpanel event, tag: '${tag}', project: '${project}', extra: '${extra || "N/A"}'`);
  res.send("DONE");
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

    console.log(`PostHog event, tag: '${tag}', project: '${project}', extra: '${extra || "N/A"}'`);
    res.send("DONE");
  } catch (error) {
    console.error(`Error tracking event in PostHog: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
