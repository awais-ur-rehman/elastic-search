# IncidentIQ

An AI-powered IT incident triage agent built with Elastic Agent Builder. You describe an incident in plain English — IncidentIQ searches the knowledge base, pulls logs, calculates error rates, and runs a triage workflow to assign priority, route to the right team, and create a ticket. All in under 30 seconds.

Built for the [Elasticsearch Agent Builder Hackathon 2026](https://elasticsearch.devpost.com/).

---

## The Problem

When something breaks in production, an on-call engineer has to manually do all of this before they can even start fixing it:

- Search through known issues to see if there's already a documented fix
- Dig through past incidents to find anything similar
- Pull up logs and figure out what's actually erroring
- Estimate how bad it is based on error rates and how many services are affected
- Decide the priority and figure out which team should handle it
- Open a ticket with all the context

That whole process takes 30–60 minutes on a good day, and it's the last thing you want to be doing at 2am during an outage. IncidentIQ automates all of it.

---

## How It Works

The agent uses five tools in a reasoning loop. It doesn't follow a rigid script — the LLM decides which tool to call next based on what it learns at each step.

```
1. Search known_issues        → Is there a documented fix for this?
2. Search past_incidents      → Has something like this happened before?
3. ES|QL → get_log_errors     → What are the actual error logs saying?
4. ES|QL → calc_error_rate    → How bad is it? How many services affected?
5. Workflow → triage_and_route → Set priority, assign team, create ticket
```

The workflow step is intentionally rules-based, not AI-driven. Priority and routing decisions need to be deterministic and auditable — that's not a job for an LLM. The agent gathers the context (its strength), then hands off to the workflow for the decisions (where deterministic logic belongs).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER / MONITORING SYSTEM                     │
│                    (Natural language incident report)                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ELASTIC AGENT BUILDER                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │           IncidentIQ Custom Agent                             │   │
│  │   (System Prompt: triage reasoning instructions)             │   │
│  │                                                              │   │
│  │   Reasoning Loop (LLM decides tool order dynamically):       │   │
│  │                                                              │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │   │
│  │   │ SEARCH Tool │  │ ES|QL Tools │  │ WORKFLOW Tool    │   │   │
│  │   │             │  │             │  │                  │   │   │
│  │   │ • known_    │  │ • get_log_  │  │ • triage_and_   │   │   │
│  │   │   issues    │  │   errors    │  │   route         │   │   │
│  │   │ • past_     │  │ • calc_     │  │                  │   │   │
│  │   │   incidents │  │   error_rate│  │                  │   │   │
│  │   └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘   │   │
│  └─────────┼─────────────────┼──────────────────┼─────────────┘   │
└────────────┼─────────────────┼──────────────────┼─────────────────┘
             │                 │                  │
             ▼                 ▼                  ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  ELASTICSEARCH  │  │ ELASTICSEARCH│  │   ELASTIC WORKFLOW   │
│                 │  │              │  │                      │
│ • known_issues  │  │ • system_    │  │ Steps:               │
│ • past_         │  │   logs       │  │  1. Determine priority│
│   incidents     │  │              │  │  2. Assign team       │
└─────────────────┘  └──────────────┘  │  3. Index ticket      │
                                       │  4. (Optional) Alert  │
                                       └──────────────────────┘
```

---

## Getting Started

### Prerequisites

- Elastic Cloud Serverless account (the free 2-week trial is fine)
- Kibana with Agent Builder enabled
- Node.js 18+

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/incidentiq-agent.git
cd incidentiq-agent
npm install
```

### 2. Set up your environment

Copy `.env.example` to `.env` and fill in your Elasticsearch URL and API key from Kibana → Settings → API Keys.

```bash
cp .env.example .env
# edit .env with your actual values
```

### 3. Create indexes and seed data

```bash
npm run setup
```

This creates four indexes and populates them:
- `known_issues` — 15 documented issues with known fixes
- `past_incidents` — 20 historical incident records
- `system_logs` — 200 synthetic log entries simulating an active incident
- `incident_tickets` — empty, the workflow writes here

Run `npm run verify` afterward to confirm everything looks good.

### 4. Enable Workflows

In Kibana → Settings, search for "Workflows" and enable the feature toggle.

### 5. Create the workflow

Go to Kibana → Workflows → New Workflow. Paste the contents of `incident_triage_workflow.yaml` and save it.

### 6. Create the tools

Go to Kibana → Agents → Tools → New Tool. You need to create five tools. The full configuration for each is in `tools.json`, but here's the quick version:

**Tool 1: `search_known_issues`**
- Type: Index search
- Target index: `known_issues`
- Description and labels: copy from tools.json

**Tool 2: `search_past_incidents`**
- Type: Index search
- Target index: `past_incidents`
- Description and labels: copy from tools.json

**Tool 3: `get_log_errors`**
- Type: ES|QL
- Query (paste exactly as-is):
```
FROM system_logs | WHERE level == "error" AND service == ?service_name AND @timestamp >= now() - 2h | SORT @timestamp desc | KEEP @timestamp, service, message, severity, component | LIMIT 20
```
- One parameter: `service_name` (type: keyword)
- Labels: `esql`, `logs`, `diagnostics`

**Tool 4: `calc_error_rate`**
- Type: ES|QL
- Query:
```
FROM system_logs | WHERE @timestamp >= now() - 2h | STATS total_logs = COUNT(*), error_count = COUNT(level == "error"), unique_services = COUNT_DISTINCT(service) | EVAL error_rate = error_count / total_logs * 100 | KEEP total_logs, error_count, unique_services, error_rate
```
- No parameters needed
- Labels: `esql`, `analytics`, `severity`

**Tool 5: `triage_and_route`**
- Type: Workflow
- Workflow: `incident_triage_workflow`
- Five parameters: `incident_summary` (string), `error_rate` (number), `affected_services` (string), `primary_service` (string), `service_category` (string)
- Labels: `workflow`, `triage`, `automation`

### 7. Create the agent

Go to Kibana → Agents → New Agent.
- Display Name: `IncidentIQ`
- Custom Instructions: paste the contents of `agent_instructions.txt`
- Assign all five tools you just created
- Save

### 8. Test it

Click Chat on the IncidentIQ agent and try any of the scenarios below.

---

## Demo Scenarios

### Scenario 1 — Payment API Outage
> "The payment API has been throwing 500 errors for the last hour. Users can't complete purchases."

The agent finds the known issue (database connection pool exhaustion), matches it to a past incident, pulls the error logs confirming it, and routes to the application team with critical priority. It surfaces the exact kubectl fix from the knowledge base.

### Scenario 2 — Auth Service Degradation
> "Users are reporting login failures intermittently since about 30 minutes ago. Some logins work, some don't."

The agent searches for auth-related issues, checks the logs for what's actually happening with auth-service, and routes accordingly. Note: the specific error the agent finds depends on what's in the current log data — the agent responds to what it actually sees rather than guessing, which is the right behavior.

### Scenario 3 — Full Outage
> "Everything is down. The website, the API, the mobile app — nothing is working. Started about 45 minutes ago."

This one's the best demo. The agent detects the cascading failures across multiple services, correctly identifies it as infrastructure-level rather than blaming any single service, assigns critical priority, and triggers the alert path in the workflow.

### Scenario 4 — Slow Product Catalog
> "The product catalog page is loading really slowly. It was fine this morning."

The agent finds the Redis cache eviction issue in the knowledge base, confirms it with logs showing 90%+ cache miss rate, and routes to the infrastructure team with high priority. It pulls up the exact Redis config fix.

---

## What's in the Repo

| File | What it does |
|---|---|
| `setup.js` | Creates all four indexes and seeds them with data |
| `verify.js` | Checks that setup ran correctly |
| `agent_instructions.txt` | The system prompt — paste this into Agent Builder |
| `tools.json` | Full config for all 5 tools (reference while creating them in Kibana) |
| `incident_triage_workflow.yaml` | The workflow YAML — paste into Kibana Workflows |
| `submission_description.md` | Devpost submission writeup |
| `.env.example` | Template for your Elasticsearch credentials |

---

## Index Schemas

### known_issues
| Field | Type | Notes |
|---|---|---|
| issue_id | keyword | e.g. KI-001 |
| title | semantic_text | Enables semantic search |
| description | semantic_text | Enables semantic search |
| affected_services | keyword[] | Which services this issue hits |
| solution | text | The documented fix |
| severity | keyword | low / medium / high / critical |
| created_at | date | |

### past_incidents
| Field | Type | Notes |
|---|---|---|
| incident_id | keyword | e.g. INC-2025-001 |
| title | semantic_text | |
| description | semantic_text | |
| services_affected | keyword[] | |
| root_cause | text | |
| resolution | text | How it was actually fixed |
| priority | keyword | |
| team_assigned | keyword | |
| duration_minutes | integer | |
| occurred_at | date | |

### system_logs
| Field | Type | Notes |
|---|---|---|
| @timestamp | date | |
| service | keyword | e.g. payment-api |
| level | keyword | info / warning / error / critical |
| severity | integer | 1–5 |
| component | keyword | e.g. db-connector |
| message | text | The actual log message |
| host | keyword | e.g. payment-api-1.prod.cluster |

### incident_tickets *(written by the workflow)*
| Field | Type | Notes |
|---|---|---|
| ticket_id | keyword | TKT-{execution_id} |
| incident_summary | text | AI-generated summary |
| priority | keyword | Determined by workflow rules |
| team_assigned | keyword | infrastructure / application / database / networking |
| team_channel | keyword | e.g. #infra-oncall |
| status | keyword | Always "open" at creation |
| primary_service | keyword | |
| affected_services | keyword | Comma-separated |
| error_rate | keyword | Percentage at time of triage |
| created_at | date | |
| created_by | keyword | "IncidentIQ" |
| alert_type | keyword | Only on critical alerts |
| alert_status | keyword | Only on critical alerts |
| alert_message | text | Only on critical alerts |
| alert_created_at | date | Only on critical alerts |
| alert_created_by | keyword | Only on critical alerts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Search & Storage | Elasticsearch Serverless |
| Agent Framework | Elastic Agent Builder |
| Reasoning | Elastic Managed LLM |
| Log Analysis | ES\|QL |
| Automation | Elastic Workflows |
| UI | Kibana Agent Chat |
| Setup Scripts | Node.js + @elastic/elasticsearch |

---

## License

MIT — see LICENSE file.
