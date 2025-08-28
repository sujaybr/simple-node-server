import express from "express";
import cors from "cors";
import helmet from "helmet";

import { PostHog } from 'posthog-node'

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_LOGS = 10000;

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

    if (logs.length > MAX_LOGS) {
      logs.shift();
    }

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
              <th>Project</th>
              <th>Tag</th>
              <th>Extra</th>
              <th>Timestamp (IST)</th>
            </tr>
          </thead>
          <tbody>
  `;

  logs.forEach(log => {
    const date = new Date(log.timestamp);
    // convert to ist
    const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const formatted = istTime.toISOString().replace('T', ' ').substring(0, 19);

    html += `
      <tr>
        <td>${log.project}</td>
        <td>${log.tag}</td>
        <td>${log.extra ?? ""}</td>
        <td>${formatted}</td>
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

app.get("/charts", (req, res) => {
  // Prepare data structure
  // { tag1: { project1: [{x: timestamp, y: count}, ...], project2: [...] }, tag2: {...} }
  const tagMap = {};

  logs.forEach(log => {
    const { tag, project, timestamp } = log;
    if (!tagMap[tag]) tagMap[tag] = {};
    if (!tagMap[tag][project]) tagMap[tag][project] = [];

    // Count 1 per event
    tagMap[tag][project].push({ x: timestamp, y: 1 });
  });

  let html = `
    <html>
      <head>
        <title>Charts</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          canvas { max-width: 100%; margin-bottom: 50px; }
        </style>
      </head>
      <body>
        <h1>Event Charts</h1>
  `;

  // For each tag, create a canvas and JS dataset
  Object.keys(tagMap).forEach((tag, index) => {
    html += `<h2>Tag: ${tag}</h2><canvas id="chart-${index}"></canvas>`;
  });

  html += `<script>`;

  Object.keys(tagMap).forEach((tag, index) => {
    const datasets = [];
    Object.keys(tagMap[tag]).forEach(project => {
      // Sort by timestamp
      const data = tagMap[tag][project]
        .sort((a, b) => new Date(a.x) - new Date(b.x));
      
      // For cumulative count, we sum counts over time
      let cum = 0;
      const cumulativeData = data.map(d => {
        cum += d.y;
        return { x: d.x, y: cum };
      });

      datasets.push({
        label: project,
        data: cumulativeData,
        fill: false,
        borderColor: `hsl(${Math.random()*360},70%,50%)`,
        tension: 0.2
      });
    });

    html += `
      new Chart(document.getElementById("chart-${index}"), {
        type: 'line',
        data: {
          datasets: ${JSON.stringify(datasets)}
        },
        options: {
          parsing: false,
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Tag: ${tag}' }
          },
          scales: {
            x: {
              type: 'time',
              time: { tooltipFormat: 'YYYY-MM-DD HH:mm:ss', unit: 'minute' },
              title: { display: true, text: 'Time' }
            },
            y: { title: { display: true, text: 'Cumulative Count' } }
          }
        }
      });
    `;
  });

  html += `</script></body></html>`;
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
