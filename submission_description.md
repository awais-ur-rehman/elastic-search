# IncidentIQ — Submission Description

## Project Overview

IncidentIQ is an AI-powered IT incident triage agent built with Elastic Agent Builder. It automates the end-to-end process of diagnosing, prioritizing, routing, and ticketing IT support incidents — a workflow that typically takes 30–60 minutes of manual effort per incident and reduces it to under 30 seconds.

## Problem Solved

When IT incidents occur, support teams manually search logs, check past incidents, assess severity, determine routing, and create tickets. This process is slow, error-prone, and creates bottleneck during high-stress outages. IncidentIQ eliminates this waste by combining AI reasoning with rules-based automation.

## How It Works

IncidentIQ is a multi-step reasoning agent that, given a natural-language incident report, executes a structured investigation loop:

1. **Search Known Issues** — Uses an Index Search tool to find documented solutions in a knowledge base
2. **Search Past Incidents** — Uses another Index Search tool to find similar historical incidents and their resolutions
3. **Analyze Logs** — Uses a parameterized ES|QL tool to retrieve recent error logs for the affected service, with time-window filtering
4. **Calculate Error Rate** — Uses a second ES|QL tool with aggregation to calculate the current error rate and count affected services across the entire platform
5. **Execute Triage Workflow** — Triggers an Elastic Workflow that performs rules-based priority assignment, team routing, and ticket creation in Elasticsearch

The LLM decides the order and arguments for each tool call based on what it learns at each step — true multi-step reasoning, not a fixed script.

## Features Used

- **Elastic Agent Builder**: Custom agent with system prompt and 5 assigned tools
- **Index Search Tools**: Two tools scoped to `known_issues` and `past_incidents` indexes, enabling semantic search over historical data
- **ES|QL Tools**: Two parameterized tools — one for targeted log retrieval with service/time filtering, and one for platform-wide error rate aggregation using STATS and EVAL
- **Elastic Workflows**: A YAML-defined workflow with if/else branching for priority rules, team assignment logic, and conditional critical alerting — all executed reliably outside the LLM
- **Semantic Text Mapping**: Key fields mapped as `semantic_text` to enable high-quality semantic search without manual embedding

## Challenges & Reflections

The biggest challenge was designing the boundary between AI reasoning and rules-based automation. Priority assignment and team routing must be deterministic — an LLM should not be making these decisions alone. Elastic Workflows solved this perfectly by letting the agent gather context (AI's strength) and then hand off to deterministic rules (Workflow's strength). This separation of concerns is the core architectural insight of IncidentIQ.

I enjoyed how ES|QL tools with parameters let me give the agent precise, parameterized queries rather than letting it generate arbitrary queries. This dramatically improves reliability and security. The semantic_text mapping was also impressive — it enabled powerful semantic search with zero embedding configuration.
