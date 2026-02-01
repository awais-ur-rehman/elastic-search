# 🤖 IncidentIQ — AI-Powered IT Support Triage Agent

> **Elasticsearch Agent Builder Hackathon 2026 Entry**
> An automated multi-step AI agent that triages, diagnoses, and routes IT support incidents using Elastic Agent Builder, ES|QL, Search, and Workflows.

---

## 📋 Table of Contents
- [Problem Statement](#-problem-statement)
- [How It Works](#-how-it-works)
- [Architecture](#-architecture)
- [Agent Tools](#-agent-tools)
- [Workflows](#-workflows)
- [Setup Guide](#-setup-guide)
- [Data Indexes](#-data-indexes)
- [Agent Configuration](#-agent-configuration)
- [Demo Scenarios](#-demo-scenarios)
- [Tech Stack](#-tech-stack)
- [License](#-license)

---

## 🔴 Problem Statement

When IT incidents occur — servers crashing, apps failing, networks degrading — support teams waste **30–60 minutes per ticket** manually:
- Searching logs for related errors
- Checking past incidents for known patterns
- Assessing severity based on impact scope
- Routing to the correct team
- Creating and updating tickets

**IncidentIQ eliminates this waste.** It's a multi-step AI agent that ingests an incident report, searches historical data for context, runs time-series log analysis via ES|QL, determines priority and routing, and executes a triage workflow — all automatically, with full explainability.

### Measurable Impact
| Metric | Before (Manual) | After (IncidentIQ) |
|---|---|---|
| Time to first triage | 30–60 min | < 30 sec |
| Steps for routing | 5–8 manual steps | 1 natural-language request |
| Error rate in priority | ~25% | ~5% (rule-backed) |
| Context gathered | 1–2 sources | 3+ sources (logs, past incidents, known issues) |

---

## ✅ How It Works

A user (or monitoring system) submits an incident in natural language:

> *"Our payment processing API is throwing 500 errors since 14:30 UTC. It's affecting checkout on the main site."*

IncidentIQ then executes this multi-step reasoning loop:

```
1. [SEARCH TOOL]     → Search `known_issues` index for matching past solutions
2. [SEARCH TOOL]     → Search `past_incidents` index for similar historical incidents
3. [ES|QL TOOL]      → Query `system_logs` for error patterns in the last 2 hours
4. [ES|QL TOOL]      → Calculate error rate and affected service scope
5. [WORKFLOW TOOL]   → Trigger triage workflow: set priority, assign team, create ticket
6. [RESPONSE]        → Return full summary: diagnosis, priority, routing, and actions taken
```

Each step is selected and executed by the LLM reasoning engine based on what it learns from the previous step's results.

---

## 🏗️ Architecture

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

## 🛠️ Agent Tools

### 1. Index Search Tools (built on Search)

| Tool ID | Index | Purpose |
|---|---|---|
| `search_known_issues` | `known_issues` | Find documented solutions for known problems |
| `search_past_incidents` | `past_incidents` | Find similar historical incidents and their resolutions |

### 2. ES\|QL Tools (time-series log analysis)

| Tool ID | Query Purpose | Parameters |
|---|---|---|
| `get_log_errors` | Retrieve recent error-level logs for a given service | `service_name` (keyword), `hours_back` (integer) |
| `calc_error_rate` | Calculate error rate and count unique affected services in a time window | `hours_back` (integer) |

### 3. Workflow Tool

| Tool ID | Workflow | Purpose |
|---|---|---|
| `triage_and_route` | `incident_triage_workflow` | Executes the full triage: sets priority, assigns team, indexes a ticket record |

---

## ⚙️ Workflows

### `incident_triage_workflow`

Defined in YAML. Triggered by the agent when it has gathered enough context to make a triage decision.

**Steps:**
1. **Determine Priority** — If/else logic based on error_rate and affected_services passed by the agent
2. **Assign Team** — Routes to `infrastructure`, `application`, `database`, or `networking` based on service category
3. **Index Ticket** — Writes a new document to the `incident_tickets` index with full metadata
4. **Alert (conditional)** — If priority is `critical`, triggers a PagerDuty-style alert (simulated via index write)

See: `workflows/incident_triage_workflow.yaml`

---

## 📲 Setup Guide

### Prerequisites
- An Elastic Cloud Serverless account (free 2-week trial works perfectly)
- Kibana access with Agent Builder enabled
- Node.js 18+ (for the setup script)

### Step 1 — Sign Up for Elastic Cloud

Go to: https://cloud.elastic.co/registration
Select **Elasticsearch Serverless** and create your project.

### Step 2 — Get Your API Keys

In Kibana:
1. Go to **Settings → API Keys**
2. Create a key with full access
3. Copy your **Elasticsearch URL** and **API Key**

### Step 3 — Create Your Indexes and Seed Data

Run the setup script:

```bash
# Clone this repo
git clone https://github.com/YOUR_USERNAME/incidentiq-agent.git
cd incidentiq-agent

# Install dependencies
npm install

# Set your env vars
export ES_URL="https://your-es-url"
export ES_API_KEY="your-api-key"

# Run the setup script (creates indexes + seeds data)
npm run setup
```

This will create 4 indexes and populate them with realistic sample data:
- `known_issues` — 15 documented known issues with solutions
- `past_incidents` — 20 historical incident records
- `system_logs` — 200 synthetic log entries across multiple services
- `incident_tickets` — empty (the workflow writes here)

### Step 4 — Enable Elastic Workflows (Tech Preview)

In Kibana:
1. Go to **Settings**
2. Search for **Workflows**
3. Enable the feature toggle

### Step 5 — Create the Workflow

1. In Kibana, navigate to **Workflows**
2. Click **New Workflow**
3. Paste the YAML from `workflows/incident_triage_workflow.yaml`
4. Save it with the name `incident_triage_workflow`
5. Enable the workflow

### Step 6 — Create Custom Tools in Agent Builder

In Kibana, go to **Agents → Tools → New Tool**. Create these tools in order:

#### Tool 1: `search_known_issues`
- **Type:** Index search
- **Index:** `known_issues`
- **Description:** *Searches the known_issues index for documented solutions to common IT problems. Use this when you need to check if a reported issue has a known fix or workaround.*

#### Tool 2: `search_past_incidents`
- **Type:** Index search
- **Index:** `past_incidents`
- **Description:** *Searches historical incident records to find similar past incidents and how they were resolved. Use this to understand patterns and find relevant precedent.*

#### Tool 3: `get_log_errors`
- **Type:** ES|QL
- **Description:** *Retrieves recent error-level log entries for a specific service. Use this to get raw log data and understand what errors are actually occurring.*
- **Query:**
```
FROM system_logs
| WHERE level == "error" AND service == ?service_name AND @timestamp >= now() - ?hours_back h
| SORT @timestamp desc
| KEEP @timestamp, service, message, severity, component
| LIMIT 20
```
- **Parameters:**
  - `service_name` — type: `keyword` — *The name of the service to check logs for (e.g., "payment-api", "auth-service")*
  - `hours_back` — type: `integer` — *Number of hours to look back in time (e.g., 2)*

#### Tool 4: `calc_error_rate`
- **Type:** ES|QL
- **Description:** *Calculates the current error rate and counts how many unique services are affected in a given time window. Use this to assess the scope and severity of an incident.*
- **Query:**
```
FROM system_logs
| WHERE @timestamp >= now() - ?hours_back h
| STATS
    total_logs = COUNT(*),
    error_count = COUNT(level == "error"),
    unique_services = COUNT_DISTINCT(service)
| EVAL error_rate = error_count / total_logs * 100
| KEEP total_logs, error_count, unique_services, error_rate
```
- **Parameters:**
  - `hours_back` — type: `integer` — *Number of hours to analyze (e.g., 2)*

#### Tool 5: `triage_and_route`
- **Type:** Workflow
- **Workflow:** `incident_triage_workflow`
- **Description:** *Triggers the incident triage workflow. Executes priority determination, team assignment, and ticket creation. Use this AFTER you have gathered diagnosis information from the other tools and are ready to take action.*

### Step 7 — Create the IncidentIQ Agent

1. In Kibana, go to **Agents → New Agent**
2. Set **Display Name:** `IncidentIQ`
3. Set **Description:** *AI-powered IT incident triage agent. Submit an incident and I will diagnose, prioritize, route, and ticket it automatically.*
4. Paste the **Custom Instructions** from `config/agent_instructions.txt`
5. Go to the **Tools** tab
6. Assign these tools: `search_known_issues`, `search_past_incidents`, `get_log_errors`, `calc_error_rate`, `triage_and_route`
7. Click **Save**

### Step 8 — Test It!

Click **Chat** on your IncidentIQ agent and try one of the demo scenarios below.

---

## 📊 Data Indexes

### `known_issues`
Documents representing documented IT problems with known solutions.

| Field | Type | Description |
|---|---|---|
| `issue_id` | keyword | Unique ID |
| `title` | text (semantic_text) | Short title of the known issue |
| `description` | text (semantic_text) | Detailed description |
| `affected_services` | keyword[] | Services this issue affects |
| `solution` | text | Known fix or workaround |
| `severity` | keyword | low / medium / high / critical |
| `created_at` | date | When documented |

### `past_incidents`
Historical incident records with outcomes.

| Field | Type | Description |
|---|---|---|
| `incident_id` | keyword | Unique ID |
| `title` | text (semantic_text) | Incident title |
| `description` | text (semantic_text) | Full incident description |
| `services_affected` | keyword[] | Services that were impacted |
| `root_cause` | text | What actually caused it |
| `resolution` | text | How it was fixed |
| `priority` | keyword | low / medium / high / critical |
| `team_assigned` | keyword | Which team handled it |
| `duration_minutes` | integer | How long to resolve |
| `occurred_at` | date | When it happened |

### `system_logs`
Synthetic system log entries for log analysis.

| Field | Type | Description |
|---|---|---|
| `@timestamp` | date | Log timestamp |
| `service` | keyword | Service name |
| `level` | keyword | info / warning / error / critical |
| `severity` | integer | 1–5 numeric severity |
| `component` | keyword | Component within the service |
| `message` | text | Log message |
| `host` | keyword | Host name |

### `incident_tickets` *(written by workflow)*
Tickets created by the triage workflow.

| Field | Type | Description |
|---|---|---|
| `ticket_id` | keyword | Auto-generated ID |
| `incident_summary` | text | AI-generated summary |
| `priority` | keyword | Assigned priority |
| `team_assigned` | keyword | Assigned team |
| `status` | keyword | open / in_progress / resolved |
| `created_at` | date | Creation timestamp |
| `created_by` | keyword | "IncidentIQ" |

---

## 💬 Demo Scenarios

Try these prompts in the IncidentIQ agent chat:

### Scenario 1 — Payment API Outage
> *"The payment API has been throwing 500 errors for the last hour. Users can't complete purchases."*

**Expected:** Agent searches known issues (finds DB connection pool issue), checks logs, calculates error rate, routes to application team with HIGH priority.

### Scenario 2 — Auth Service Degradation
> *"Users are reporting login failures intermittently since about 30 minutes ago. Some logins work, some don't."*

**Expected:** Agent finds a past incident about auth token refresh, checks logs for pattern, assesses as MEDIUM priority, routes to application team.

### Scenario 3 — Full Outage — Multiple Services Down
> *"Everything is down. The website, the API, the mobile app — nothing is working. Started about 45 minutes ago."*

**Expected:** Agent detects high error rate across multiple services, identifies it as infrastructure-level, sets CRITICAL priority, routes to infrastructure team, triggers alert.

### Scenario 4 — Slow Database Queries
> *"The product catalog page is loading really slowly. It was fine this morning."*

**Expected:** Agent searches for known DB performance issues, checks logs for slow query warnings, routes to database team with MEDIUM priority.

---

## 💻 Tech Stack

| Component | Technology |
|---|---|
| Search & Analytics | Elasticsearch (Serverless) |
| Agent Framework | Elastic Agent Builder |
| Agent Reasoning | Elastic Managed LLM (default) |
| Log Analysis | ES\|QL |
| Automation | Elastic Workflows (YAML) |
| UI | Kibana Agent Chat |
| Setup Script | Node.js + Elasticsearch JS Client |
| Protocols | Kibana API, MCP-compatible |

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

*Built for the Elasticsearch Agent Builder Hackathon 2026. Questions? Join the #hackathon-agent-builder Slack channel.*
