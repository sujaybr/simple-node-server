import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PostHog } from "posthog-node";
import { format } from "date-fns";

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_LOGS = 10000;

const ph = new PostHog(
  process.env["POST_HOG_KEY"] || "empty",
  { host: "https://us.i.posthog.com" }
);

const logs = [];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

app.use(cors());

app.get("/", (req, res) => {
  console.log("GET / - Health check");
  res.send("OK");
});

app.get("/ph/:project/:tag/:extra?", (req, res) => {
  const { project, tag, extra } = req.params;

  try {
    ph.capture({
      distinctId: "default-user",
      event: tag,
      properties: {
        project,
        tag,
        extra: extra || null,
      },
    });

    logs.push({
      timestamp: new Date().toISOString(),
      project,
      tag,
      extra: extra || null,
    });

    if (logs.length > MAX_LOGS) logs.shift();

    console.log(
      `PostHog event, tag: '${tag}', project: '${project}', extra: '${extra || "N/A"}'`
    );
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

  logs.forEach((log) => {
    const date = new Date(log.timestamp);
    const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const formatted = istTime.toISOString().replace("T", " ").substring(0, 19);

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
  const now = new Date();
  const past24h = [];
  for (let i = 23; i >= 0; i--) {
    const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
    const istHour = new Date(hour.getTime() + 5.5 * 60 * 60 * 1000);
    past24h.push(format(istHour, "yyyy-MM-dd HH:00"));
  }

  const projectMap = {};
  logs.forEach((log) => {
    const { project, tag, timestamp } = log;
    const logHour = format(
      new Date(new Date(timestamp).getTime() + 5.5 * 60 * 60 * 1000),
      "yyyy-MM-dd HH:00"
    );

    if (!projectMap[project]) projectMap[project] = {};
    if (!projectMap[project][tag]) projectMap[project][tag] = {};
    if (!projectMap[project][tag][logHour]) projectMap[project][tag][logHour] = 0;

    projectMap[project][tag][logHour]++;
  });

  let html = `
    <html>
      <head>
        <title>Project Charts</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .chart-container {
            max-width: 600px;
            height: 300px;
            margin-bottom: 30px;
          }
          canvas {
            width: 100% !important;
            height: 100% !important;
          }
        </style>
      </head>
      <body>
        <h1>Project Event Charts (Last 24h)</h1>
  `;

  Object.keys(projectMap).forEach((project, index) => {
    html += `<h2>Project: ${project}</h2><div class="chart-container"><canvas id="chart-${index}"></canvas></div>`;
  });

  html += `<script>`;

  Object.keys(projectMap).forEach((project, index) => {
    const labels = past24h;
    const datasets = Object.keys(projectMap[project]).map((tag) => {
      const data = labels.map((hour) => projectMap[project][tag][hour] || 0);
      return {
        label: tag,
        data,
        fill: false,
        borderColor: `hsl(${Math.random() * 360},70%,50%)`,
        tension: 0.2,
      };
    });

    html += `
      new Chart(document.getElementById("chart-${index}"), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: ${JSON.stringify(datasets)}
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: { title: { display: true, text: 'Requests' }, beginAtZero: true },
            x: { title: { display: true, text: 'Hour (IST)' } }
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
