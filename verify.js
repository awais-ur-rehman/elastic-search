require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");

const client = new Client({
  node: process.env.ES_URL,
  auth: { apiKey: process.env.ES_API_KEY },
});

const EXPECTED = {
  known_issues: { min: 15, description: "Documented known IT issues with solutions" },
  past_incidents: { min: 20, description: "Historical incident records" },
  system_logs: { min: 150, description: "Synthetic system log entries" },
  incident_tickets: { min: 0, description: "Tickets created by triage workflow (starts empty)" },
};

async function verify() {
  console.log("🔍 IncidentIQ — Verification");
  console.log("─────────────────────────────\n");

  let allGood = true;

  for (const [indexName, expected] of Object.entries(EXPECTED)) {
    const exists = await client.indices.exists({ index: indexName });

    if (!exists) {
      console.log(`${indexName} — INDEX NOT FOUND`);
      allGood = false;
      continue;
    }

    const count = await client.count({ index: indexName });
    const docCount = count.body.count;
    const status = docCount >= expected.min ? "✅" : "⚠️";

    console.log(`${status} ${indexName}`);
    console.log(`   Documents: ${docCount} (expected: ${expected.min}+)`);
    console.log(`   Purpose: ${expected.description}`);
    console.log();
  }

  // Sample document check
  console.log("📄 Sample Documents:");
  console.log("─────────────────────────────\n");

  try {
    const kiSample = await client.search({
      index: "known_issues",
      body: { size: 1, sort: [{ created_at: { order: "desc" } }] },
    });
    if (kiSample.body.hits.hits.length > 0) {
      const doc = kiSample.body.hits.hits[0]._source;
      console.log(`known_issues sample: "${doc.title}" (severity: ${doc.severity})`);
    }
  } catch (e) {
    console.log(`known_issues sample failed: ${e.message}`);
  }

  try {
    const piSample = await client.search({
      index: "past_incidents",
      body: { size: 1, sort: [{ occurred_at: { order: "desc" } }] },
    });
    if (piSample.body.hits.hits.length > 0) {
      const doc = piSample.body.hits.hits[0]._source;
      console.log(`✅ past_incidents sample: "${doc.title}" (priority: ${doc.priority})`);
    }
  } catch (e) {
    console.log(`past_incidents sample failed: ${e.message}`);
  }

  try {
    const logSample = await client.search({
      index: "system_logs",
      body: {
        size: 1,
        query: { term: { level: "error" } },
        sort: [{ "@timestamp": { order: "desc" } }],
      },
    });
    if (logSample.body.hits.hits.length > 0) {
      const doc = logSample.body.hits.hits[0]._source;
      console.log(`system_logs sample: [${doc.level}] ${doc.service} — "${doc.message.substring(0, 60)}..."`);
    }
  } catch (e) {
    console.log(`system_logs sample failed: ${e.message}`);
  }

  console.log("\n─────────────────────────────");
  if (allGood) {
    console.log("All indexes verified! Ready for Agent Builder setup.");
  } else {
    console.log("Some indexes are missing. Run `npm run setup` first.");
  }
}

verify().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
