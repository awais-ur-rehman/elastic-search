require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");

const client = new Client({
  node: process.env.ES_URL,
  auth: { apiKey: process.env.ES_API_KEY },
});

// ─────────────────────────────────────────────
// INDEX MAPPINGS
// ─────────────────────────────────────────────

const INDEXES = {
  known_issues: {
    mappings: {
      properties: {
        issue_id: { type: "keyword" },
        title: { type: "semantic_text" },
        description: { type: "semantic_text" },
        affected_services: { type: "keyword" },
        solution: { type: "text" },
        severity: { type: "keyword" },
        created_at: { type: "date" },
      },
    },
  },
  past_incidents: {
    mappings: {
      properties: {
        incident_id: { type: "keyword" },
        title: { type: "semantic_text" },
        description: { type: "semantic_text" },
        services_affected: { type: "keyword" },
        root_cause: { type: "text" },
        resolution: { type: "text" },
        priority: { type: "keyword" },
        team_assigned: { type: "keyword" },
        duration_minutes: { type: "integer" },
        occurred_at: { type: "date" },
      },
    },
  },
  system_logs: {
    mappings: {
      properties: {
        "@timestamp": { type: "date" },
        service: { type: "keyword" },
        level: { type: "keyword" },
        severity: { type: "integer" },
        component: { type: "keyword" },
        message: { type: "text" },
        host: { type: "keyword" },
      },
    },
  },
  incident_tickets: {
    mappings: {
      properties: {
        ticket_id: { type: "keyword" },
        incident_summary: { type: "text" },
        priority: { type: "keyword" },
        team_assigned: { type: "keyword" },
        status: { type: "keyword" },
        created_at: { type: "date" },
        created_by: { type: "keyword" },
      },
    },
  },
};

// ─────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────

const KNOWN_ISSUES = [
  {
    issue_id: "KI-001",
    title: "Database connection pool exhaustion under high traffic",
    description:
      "When traffic spikes above 10K concurrent requests, the PostgreSQL connection pool runs out of available connections. This causes 500 errors on all API endpoints that touch the database.",
    affected_services: ["payment-api", "user-service", "order-service"],
    solution:
      "Increase max_pool_size in db-config from 20 to 100. Apply via: kubectl apply -f config/db-pool-patch.yaml. Monitor with the db-pool-usage dashboard.",
    severity: "critical",
    created_at: "2025-11-15T00:00:00Z",
  },
  {
    issue_id: "KI-002",
    title: "Auth token refresh race condition",
    description:
      "Under intermittent load, the auth-service can fail to refresh tokens before they expire, causing transient 401 errors for some users while others succeed.",
    affected_services: ["auth-service", "api-gateway"],
    solution:
      "Set token refresh buffer to 60 seconds before expiry. Patch: SET token_refresh_buffer=60 in auth-service env vars, then redeploy.",
    severity: "high",
    created_at: "2025-10-22T00:00:00Z",
  },
  {
    issue_id: "KI-003",
    title: "Nginx worker process crash on malformed headers",
    description:
      "Certain malformed HTTP headers from upstream proxies can cause individual Nginx worker processes to crash. This results in intermittent 502 errors.",
    affected_services: ["api-gateway", "frontend"],
    solution:
      "Upgrade Nginx to 1.25.3+. Add header validation middleware. See runbook: nginx-worker-crash-fix.md",
    severity: "medium",
    created_at: "2025-09-08T00:00:00Z",
  },
  {
    issue_id: "KI-004",
    title: "Redis cache eviction causing slow product lookups",
    description:
      "When Redis memory reaches 80%, LRU eviction kicks in aggressively, clearing product cache entries. This causes a thundering herd on the product-catalog service.",
    affected_services: ["product-catalog", "recommendation-engine"],
    solution:
      "Increase Redis maxmemory to 4GB. Set maxmemory-policy to volatile-lfu instead of volatile-lru.",
    severity: "medium",
    created_at: "2025-08-14T00:00:00Z",
  },
  {
    issue_id: "KI-005",
    title: "Kubernetes pod OOMKill on notification-service",
    description:
      "The notification-service pod is killed by OOMKiller when processing large email batches (>5000 recipients). This causes notification delivery failures.",
    affected_services: ["notification-service"],
    solution:
      "Increase memory limit from 512Mi to 1Gi. Implement batch chunking: split large batches into groups of 500. See: notification-oom-fix.yaml",
    severity: "high",
    created_at: "2025-07-30T00:00:00Z",
  },
  {
    issue_id: "KI-006",
    title: "DNS resolution delays in microservice mesh",
    description:
      "Intermittent DNS resolution delays (1-3 seconds) between microservices when the CoreDNS pod restarts or is under heavy load.",
    affected_services: [
      "payment-api",
      "order-service",
      "auth-service",
      "user-service",
    ],
    solution:
      "Scale CoreDNS to 3 replicas. Add ndots:5 to pod DNS config. Consider using ClusterIP caching.",
    severity: "medium",
    created_at: "2025-06-19T00:00:00Z",
  },
  {
    issue_id: "KI-007",
    title: "Elasticsearch index rebalancing causes search latency spikes",
    description:
      "When ES cluster rebalances shards (after node addition/removal), search latency spikes 5-10x for 2-3 minutes.",
    affected_services: ["search-service", "product-catalog"],
    solution:
      "Set cluster.routing.allocation.enable=none during maintenance. Use _cluster/reroute with specific shard commands.",
    severity: "low",
    created_at: "2025-05-11T00:00:00Z",
  },
  {
    issue_id: "KI-008",
    title: "CI/CD pipeline timeout on large Docker builds",
    description:
      "Docker image builds exceeding 10 minutes timeout in the CI pipeline, causing false build failures.",
    affected_services: ["ci-cd-pipeline"],
    solution:
      "Increase pipeline timeout to 30 minutes. Enable Docker layer caching. Use multi-stage builds to reduce image size.",
    severity: "low",
    created_at: "2025-04-25T00:00:00Z",
  },
  {
    issue_id: "KI-009",
    title: "Payment gateway webhook timeout under load",
    description:
      "The external payment gateway webhook endpoint times out (30s) when our callback endpoint is slow, causing duplicate payment attempts.",
    affected_services: ["payment-api", "webhook-handler"],
    solution:
      "Implement idempotency keys on webhook handler. Add webhook queue with async processing. See: payment-webhook-idempotency.md",
    severity: "critical",
    created_at: "2025-03-18T00:00:00Z",
  },
  {
    issue_id: "KI-010",
    title: "Log aggregation pipeline lag during traffic spikes",
    description:
      "Logstash pipeline falls behind by 5-15 minutes during traffic spikes, causing delayed visibility into issues.",
    affected_services: ["logging-pipeline"],
    solution:
      "Scale Logstash to 3 instances. Increase queue size. Consider switching to vector for better throughput.",
    severity: "low",
    created_at: "2025-02-09T00:00:00Z",
  },
  {
    issue_id: "KI-011",
    title: "SSL certificate auto-renewal failure",
    description:
      "Let's Encrypt certificate auto-renewal fails silently when the ACME challenge endpoint is blocked by WAF rules.",
    affected_services: ["api-gateway", "frontend"],
    solution:
      "Add ACME challenge path to WAF whitelist. Set up monitoring alert 48h before cert expiry.",
    severity: "critical",
    created_at: "2025-01-28T00:00:00Z",
  },
  {
    issue_id: "KI-012",
    title: "Slow cold start on Lambda functions after deployment",
    description:
      "AWS Lambda functions experience 3-5 second cold starts after fresh deployments, causing user-facing latency.",
    affected_services: ["lambda-workers", "api-gateway"],
    solution:
      "Enable provisioned concurrency (min 3). Use connection pooling. Consider moving hot paths to ECS.",
    severity: "medium",
    created_at: "2024-12-15T00:00:00Z",
  },
  {
    issue_id: "KI-013",
    title: "MongoDB oplog lag causing replication delay",
    description:
      "Secondary MongoDB nodes fall behind primary by up to 5 minutes during heavy write workloads.",
    affected_services: ["user-service", "analytics-service"],
    solution:
      "Increase oplog size to 10GB. Optimize write concern to w:1 for non-critical writes. Check for missing indexes.",
    severity: "medium",
    created_at: "2024-11-20T00:00:00Z",
  },
  {
    issue_id: "KI-014",
    title: "gRPC channel connection leak in recommendation engine",
    description:
      "The recommendation-engine leaks gRPC channels when upstream services are unavailable, eventually exhausting file descriptors.",
    affected_services: ["recommendation-engine"],
    solution:
      "Implement proper channel lifecycle management with interceptors. Add graceful shutdown hooks. See: grpc-channel-fix.js",
    severity: "high",
    created_at: "2024-10-05T00:00:00Z",
  },
  {
    issue_id: "KI-015",
    title: "Rate limiter false positives on shared IP ranges",
    description:
      "Corporate users behind shared NAT IPs hit rate limits intended for bot protection, causing legitimate request failures.",
    affected_services: ["api-gateway", "rate-limiter"],
    solution:
      "Switch rate limiting from IP-based to user/session-based for authenticated requests. Keep IP-based only for unauthenticated.",
    severity: "medium",
    created_at: "2024-09-12T00:00:00Z",
  },
];

const PAST_INCIDENTS = [
  {
    incident_id: "INC-2025-001",
    title: "Payment processing outage — DB connection pool exhausted",
    description:
      "All payment transactions failed for 45 minutes due to database connection pool exhaustion triggered by a traffic spike from a marketing campaign.",
    services_affected: ["payment-api", "order-service"],
    root_cause:
      "max_pool_size was set to 20. Traffic spike from email campaign pushed concurrent DB connections to 200+.",
    resolution:
      "Emergency patch to increase pool size to 100. Added connection pooling metrics alert.",
    priority: "critical",
    team_assigned: "application",
    duration_minutes: 45,
    occurred_at: "2025-12-14T14:22:00Z",
  },
  {
    incident_id: "INC-2025-002",
    title: "Intermittent auth failures — token refresh race condition",
    description:
      "~15% of authenticated users experienced login failures intermittently over a 2-hour window.",
    services_affected: ["auth-service", "api-gateway"],
    root_cause:
      "Token refresh buffer was too short (5s). Under load, refresh requests arrived after token expiry.",
    resolution:
      "Increased token refresh buffer to 60s. Deployed hotfix in 30 minutes.",
    priority: "high",
    team_assigned: "application",
    duration_minutes: 120,
    occurred_at: "2025-11-28T09:15:00Z",
  },
  {
    incident_id: "INC-2025-003",
    title: "Full site outage — Nginx worker crash cascade",
    description:
      "All frontend and API requests returned 502 errors for 20 minutes after Nginx workers crashed due to malformed headers from a misconfigured upstream proxy.",
    services_affected: ["api-gateway", "frontend"],
    root_cause:
      "A deploy pushed a misconfigured upstream proxy that sent malformed headers. Nginx workers crashed sequentially.",
    resolution:
      "Rolled back the proxy config. Upgraded Nginx to patched version.",
    priority: "critical",
    team_assigned: "infrastructure",
    duration_minutes: 20,
    occurred_at: "2025-11-10T16:45:00Z",
  },
  {
    incident_id: "INC-2025-004",
    title: "Product catalog slow load — Redis cache eviction",
    description:
      "Product catalog pages took 8-12 seconds to load instead of normal <1s for 3 hours during peak shopping hours.",
    services_affected: ["product-catalog", "recommendation-engine"],
    root_cause:
      "Redis hit 80% memory, triggering aggressive LRU eviction of product cache entries.",
    resolution:
      "Increased Redis maxmemory. Changed eviction policy to volatile-lfu.",
    priority: "high",
    team_assigned: "infrastructure",
    duration_minutes: 180,
    occurred_at: "2025-10-25T18:30:00Z",
  },
  {
    incident_id: "INC-2025-005",
    title: "Notification delivery failures — OOMKill on pod",
    description:
      "~2000 notification emails were not delivered when the notification-service pod was killed by OOMKiller while processing a large batch.",
    services_affected: ["notification-service"],
    root_cause: "Large email batch (6200 recipients) exceeded 512Mi memory limit.",
    resolution:
      "Increased memory limit to 1Gi. Implemented batch chunking (500 per batch).",
    priority: "high",
    team_assigned: "application",
    duration_minutes: 60,
    occurred_at: "2025-10-01T11:00:00Z",
  },
  {
    incident_id: "INC-2025-006",
    title: "Cascading service failures — DNS resolution delays",
    description:
      "Multiple microservices experienced intermittent failures as inter-service calls timed out due to DNS resolution delays.",
    services_affected: [
      "payment-api",
      "order-service",
      "auth-service",
      "user-service",
    ],
    root_cause:
      "CoreDNS pod restarted due to OOMKill, causing DNS resolution delays of 1-3 seconds across the mesh.",
    resolution: "Scaled CoreDNS to 3 replicas. Added DNS caching.",
    priority: "critical",
    team_assigned: "infrastructure",
    duration_minutes: 35,
    occurred_at: "2025-09-17T02:10:00Z",
  },
  {
    incident_id: "INC-2025-007",
    title: "Search latency spike during ES rebalancing",
    description:
      "Product search and recommendations were 5-10x slower for 3 minutes after an Elasticsearch node was added for scaling.",
    services_affected: ["search-service", "product-catalog"],
    root_cause:
      "ES cluster automatically rebalanced shards after new node addition.",
    resolution:
      "Implemented controlled shard migration during maintenance windows.",
    priority: "medium",
    team_assigned: "infrastructure",
    duration_minutes: 3,
    occurred_at: "2025-08-22T10:00:00Z",
  },
  {
    incident_id: "INC-2025-008",
    title: "Duplicate payment charges — webhook timeout",
    description:
      "12 customers were charged twice when our payment callback endpoint was slow and the payment gateway retried webhooks.",
    services_affected: ["payment-api", "webhook-handler"],
    root_cause:
      "Callback endpoint responded in >30s due to DB load. Gateway retried, causing duplicate processing.",
    resolution:
      "Implemented idempotency keys. Added async webhook queue. Refunded affected customers.",
    priority: "critical",
    team_assigned: "application",
    duration_minutes: 90,
    occurred_at: "2025-07-11T15:22:00Z",
  },
  {
    incident_id: "INC-2025-009",
    title: "Monitoring blind spot — log pipeline lag",
    description:
      "A production issue went undetected for 10 minutes because log aggregation was lagging by 15 minutes during a traffic spike.",
    services_affected: ["logging-pipeline"],
    root_cause:
      "Single Logstash instance couldn't keep up with 10x normal log volume.",
    resolution: "Scaled Logstash to 3 instances. Increased buffer queue size.",
    priority: "medium",
    team_assigned: "infrastructure",
    duration_minutes: 25,
    occurred_at: "2025-06-03T08:45:00Z",
  },
  {
    incident_id: "INC-2025-010",
    title: "SSL certificate expiry — site went HTTPS-invalid",
    description:
      "The main website showed SSL certificate errors for 4 hours after the auto-renewal failed silently.",
    services_affected: ["api-gateway", "frontend"],
    root_cause: "WAF rules blocked the ACME challenge endpoint needed for renewal.",
    resolution:
      "Whitelisted ACME path in WAF. Manually renewed cert. Added 48h expiry alert.",
    priority: "critical",
    team_assigned: "infrastructure",
    duration_minutes: 240,
    occurred_at: "2025-05-18T00:01:00Z",
  },
  {
    incident_id: "INC-2025-011",
    title: "Cold start latency — new Lambda deployment",
    description:
      "After a routine deployment, API response times spiked to 5s for the first request per Lambda instance.",
    services_affected: ["lambda-workers", "api-gateway"],
    root_cause: "New deployment invalidated all provisioned concurrency instances.",
    resolution:
      "Configured rolling deployment to maintain warm instances. Enabled provisioned concurrency.",
    priority: "medium",
    team_assigned: "application",
    duration_minutes: 15,
    occurred_at: "2025-04-29T14:00:00Z",
  },
  {
    incident_id: "INC-2025-012",
    title: "User data sync delay — MongoDB replication lag",
    description:
      "User profile updates took up to 5 minutes to propagate to read replicas, causing stale data issues.",
    services_affected: ["user-service", "analytics-service"],
    root_cause:
      "Heavy write workload caused oplog lag on secondary nodes. Oplog was undersized.",
    resolution: "Increased oplog size to 10GB. Optimized write concern settings.",
    priority: "medium",
    team_assigned: "database",
    duration_minutes: 45,
    occurred_at: "2025-03-15T10:30:00Z",
  },
  {
    incident_id: "INC-2025-013",
    title: "Recommendation engine crash — gRPC channel leak",
    description:
      "The recommendation engine crashed after 6 hours of operation due to file descriptor exhaustion from leaked gRPC channels.",
    services_affected: ["recommendation-engine"],
    root_cause:
      "gRPC channels to an unavailable upstream were never closed, leaking file descriptors.",
    resolution:
      "Implemented proper channel lifecycle management with interceptors and shutdown hooks.",
    priority: "high",
    team_assigned: "application",
    duration_minutes: 30,
    occurred_at: "2025-02-20T06:00:00Z",
  },
  {
    incident_id: "INC-2025-014",
    title: "Corporate users blocked — rate limiter false positives",
    description:
      "A major corporate client reported that their employees were getting blocked from using the platform intermittently.",
    services_affected: ["api-gateway", "rate-limiter"],
    root_cause:
      "All corporate users shared a NAT IP, hitting the IP-based rate limit meant for bots.",
    resolution:
      "Switched authenticated requests to session-based rate limiting.",
    priority: "medium",
    team_assigned: "infrastructure",
    duration_minutes: 40,
    occurred_at: "2025-01-10T11:15:00Z",
  },
  {
    incident_id: "INC-2025-015",
    title: "API gateway memory leak after config change",
    description:
      "The API gateway gradually consumed memory over 8 hours after a config update, eventually crashing.",
    services_affected: ["api-gateway"],
    root_cause:
      "New middleware was not properly releasing request context objects, causing a memory leak.",
    resolution: "Rolled back config. Fixed middleware with proper cleanup hooks.",
    priority: "high",
    team_assigned: "application",
    duration_minutes: 480,
    occurred_at: "2024-12-05T22:00:00Z",
  },
  {
    incident_id: "INC-2024-016",
    title: "Scheduled job failure — timezone misconfiguration",
    description:
      "Nightly data aggregation jobs failed to run for 3 consecutive nights due to a timezone config error after a daylight saving change.",
    services_affected: ["analytics-service", "reporting-service"],
    root_cause: "Cron expressions used local timezone which shifted with DST.",
    resolution: "Converted all cron schedules to UTC. Added job completion monitoring.",
    priority: "medium",
    team_assigned: "application",
    duration_minutes: 0,
    occurred_at: "2024-11-03T00:00:00Z",
  },
  {
    incident_id: "INC-2024-017",
    title: "Database failover delay — slow primary detection",
    description:
      "When the primary PostgreSQL node crashed, it took 90 seconds for the cluster to promote a secondary, causing extended downtime.",
    services_affected: ["payment-api", "order-service", "user-service"],
    root_cause: "Health check interval was set to 30s, too long for fast failover.",
    resolution:
      "Reduced health check interval to 5s. Implemented connection retry with exponential backoff.",
    priority: "critical",
    team_assigned: "database",
    duration_minutes: 90,
    occurred_at: "2024-10-18T03:30:00Z",
  },
  {
    incident_id: "INC-2024-018",
    title: "CDN cache poisoning — incorrect content served",
    description:
      "Users in EU region were served US-specific content for 2 hours due to a CDN cache key misconfiguration.",
    services_affected: ["frontend", "cdn"],
    root_cause: "Region-specific cache keys were not properly configured after CDN provider migration.",
    resolution: "Fixed cache key configuration. Purged affected CDN cache entries.",
    priority: "medium",
    team_assigned: "infrastructure",
    duration_minutes: 120,
    occurred_at: "2024-09-25T14:00:00Z",
  },
  {
    incident_id: "INC-2024-019",
    title: "Background job queue backup — RabbitMQ disk full",
    description:
      "All background jobs (email sending, data processing) stopped when RabbitMQ ran out of disk space.",
    services_affected: [
      "notification-service",
      "analytics-service",
      "order-service",
    ],
    root_cause:
      "RabbitMQ disk usage wasn't monitored. A large message backlog filled the disk.",
    resolution:
      "Cleared stale messages. Expanded disk. Added disk usage alert at 70%.",
    priority: "high",
    team_assigned: "infrastructure",
    duration_minutes: 60,
    occurred_at: "2024-08-12T09:00:00Z",
  },
  {
    incident_id: "INC-2024-020",
    title: "API version conflict — breaking change in shared library",
    description:
      "Three microservices crashed simultaneously after a shared library update introduced a breaking change in the response format.",
    services_affected: ["order-service", "user-service", "product-catalog"],
    root_cause:
      "Shared library v2.1.0 changed response schema without backward compatibility. No integration tests caught it.",
    resolution:
      "Pinned affected services to library v2.0.9. Added contract testing to CI pipeline.",
    priority: "critical",
    team_assigned: "application",
    duration_minutes: 25,
    occurred_at: "2024-07-08T16:30:00Z",
  },
];

// ─────────────────────────────────────────────
// GENERATE SYNTHETIC LOG DATA
// ─────────────────────────────────────────────

function generateLogs() {
  const logs = [];
  const services = [
    "payment-api",
    "auth-service",
    "order-service",
    "user-service",
    "product-catalog",
    "api-gateway",
    "notification-service",
    "recommendation-engine",
    "search-service",
    "analytics-service",
  ];

  const components = {
    "payment-api": ["db-connector", "gateway-client", "validator", "cache"],
    "auth-service": [
      "token-manager",
      "oauth-handler",
      "session-store",
      "validator",
    ],
    "order-service": [
      "order-processor",
      "inventory-check",
      "payment-client",
      "notifier",
    ],
    "user-service": [
      "profile-manager",
      "auth-client",
      "cache-layer",
      "validator",
    ],
    "product-catalog": [
      "search-client",
      "cache-layer",
      "image-handler",
      "recommendation-client",
    ],
    "api-gateway": [
      "router",
      "rate-limiter",
      "auth-middleware",
      "load-balancer",
    ],
    "notification-service": [
      "email-sender",
      "sms-sender",
      "template-engine",
      "queue-consumer",
    ],
    "recommendation-engine": [
      "ml-model",
      "data-fetcher",
      "cache-layer",
      "grpc-client",
    ],
    "search-service": ["es-client", "query-builder", "ranker", "cache"],
    "analytics-service": [
      "event-processor",
      "aggregator",
      "db-writer",
      "scheduler",
    ],
  };

  const errorMessages = {
    "payment-api": [
      "Connection pool exhausted: max 20 connections reached",
      "Payment gateway timeout after 30000ms",
      "Failed to process transaction: insufficient funds validation error",
      "Database query timeout: SELECT on payments table exceeded 5000ms",
    ],
    "auth-service": [
      "Token refresh failed: token expired 2s before refresh attempt",
      "OAuth callback timeout: provider did not respond in 10s",
      "Session store connection refused: Redis unavailable",
      "Invalid token signature detected in request",
    ],
    "order-service": [
      "Inventory check failed: upstream service unavailable",
      "Payment client error: connection refused",
      "Order processing timeout: exceeded 15s SLA",
      "Notification dispatch failed: queue full",
    ],
    "api-gateway": [
      "Upstream service unreachable: payment-api (connection refused)",
      "Rate limit exceeded for IP 192.168.1.45",
      "SSL handshake failed: certificate validation error",
      "Request routing failed: no healthy upstream available",
    ],
    "product-catalog": [
      "Cache miss rate exceeded 90%: Redis eviction in progress",
      "Search service timeout: query took >5000ms",
      "Image processing OOM: large image batch exceeded memory limit",
      "Recommendation client timeout: no response in 3s",
    ],
    "notification-service": [
      "Email batch processing OOM: batch size 6200 exceeded limits",
      "SMTP connection refused: mail server unavailable",
      "Template rendering error: missing variable in context",
      "Queue consumer lag: 5000 messages behind",
    ],
    "recommendation-engine": [
      "gRPC channel error: upstream unavailable, channel leaked",
      "ML model inference timeout: prediction took >2000ms",
      "Data fetcher error: upstream service returned 500",
      "Cache layer error: Redis connection pool exhausted",
    ],
    "search-service": [
      "Elasticsearch timeout: query took >10000ms during rebalance",
      "Query builder error: invalid query syntax",
      "Index not found: search_products index missing",
      "ES client connection error: cluster unreachable",
    ],
    "user-service": [
      "MongoDB replication lag detected: secondary 4.5s behind primary",
      "Profile update failed: optimistic lock conflict",
      "Auth client timeout: token validation took >5s",
      "Cache write failed: Redis connection refused",
    ],
    "analytics-service": [
      "Event processing lag: 15 minutes behind real-time",
      "Aggregation job failed: out of memory during reduce phase",
      "DB write error: connection pool exhausted",
      "Scheduler error: job missed scheduled time by 300s",
    ],
  };

  const warningMessages = {
    "payment-api": [
      "Connection pool usage at 80%: 16/20 connections active",
      "Payment gateway response time degraded: avg 2500ms (threshold: 1000ms)",
      "High retry rate detected: 35% of transactions retried",
    ],
    "auth-service": [
      "Token refresh latency high: avg 800ms (threshold: 200ms)",
      "High failed auth rate: 12% of attempts failed in last 5 minutes",
      "Session store memory usage at 85%",
    ],
    "api-gateway": [
      "Upstream latency P99 above threshold: payment-api at 4500ms",
      "Rate limiter approaching limit for corporate IP range",
      "High error rate from upstream: auth-service returning 15% 5xx",
    ],
    "product-catalog": [
      "Cache hit rate dropping: currently at 65% (threshold: 80%)",
      "Search latency elevated: P95 at 3200ms",
      "Recommendation engine response degraded",
    ],
  };

  const now = new Date();

  // Generate normal (info) logs — last 4 hours
  for (let i = 0; i < 120; i++) {
    const service =
      services[Math.floor(Math.random() * services.length)];
    const comp =
      components[service][
      Math.floor(Math.random() * components[service].length)
      ];
    const timestamp = new Date(
      now.getTime() - Math.random() * 4 * 60 * 60 * 1000
    );

    logs.push({
      "@timestamp": timestamp.toISOString(),
      service,
      level: "info",
      severity: 1,
      component: comp,
      message: `[${comp}] Request processed successfully in ${Math.floor(Math.random() * 200 + 10)}ms`,
      host: `${service}-${Math.floor(Math.random() * 3) + 1}.prod.cluster`,
    });
  }

  // Generate warning logs — last 3 hours
  const warningServices = Object.keys(warningMessages);
  for (let i = 0; i < 30; i++) {
    const service =
      warningServices[Math.floor(Math.random() * warningServices.length)];
    const comp =
      components[service][
      Math.floor(Math.random() * components[service].length)
      ];
    const msgs = warningMessages[service];
    const timestamp = new Date(
      now.getTime() - Math.random() * 3 * 60 * 60 * 1000
    );

    logs.push({
      "@timestamp": timestamp.toISOString(),
      service,
      level: "warning",
      severity: 3,
      component: comp,
      message: msgs[Math.floor(Math.random() * msgs.length)],
      host: `${service}-${Math.floor(Math.random() * 3) + 1}.prod.cluster`,
    });
  }

  // Generate error logs — concentrated in last 2 hours (simulates active incident)
  const errorServices = Object.keys(errorMessages);
  for (let i = 0; i < 40; i++) {
    const service =
      errorServices[Math.floor(Math.random() * errorServices.length)];
    const comp =
      components[service][
      Math.floor(Math.random() * components[service].length)
      ];
    const msgs = errorMessages[service];
    const timestamp = new Date(
      now.getTime() - Math.random() * 2 * 60 * 60 * 1000
    );

    logs.push({
      "@timestamp": timestamp.toISOString(),
      service,
      level: "error",
      severity: 4,
      component: comp,
      message: msgs[Math.floor(Math.random() * msgs.length)],
      host: `${service}-${Math.floor(Math.random() * 3) + 1}.prod.cluster`,
    });
  }

  // Generate critical logs — last 30 minutes (highest urgency)
  const criticalServices = ["payment-api", "api-gateway", "auth-service"];
  for (let i = 0; i < 10; i++) {
    const service =
      criticalServices[Math.floor(Math.random() * criticalServices.length)];
    const comp =
      components[service][
      Math.floor(Math.random() * components[service].length)
      ];
    const timestamp = new Date(
      now.getTime() - Math.random() * 30 * 60 * 1000
    );

    logs.push({
      "@timestamp": timestamp.toISOString(),
      service,
      level: "critical",
      severity: 5,
      component: comp,
      message: `CRITICAL: ${service} is completely unresponsive. Health check failing.`,
      host: `${service}-${Math.floor(Math.random() * 3) + 1}.prod.cluster`,
    });
  }

  return logs;
}

// ─────────────────────────────────────────────
// MAIN SETUP FUNCTION
// ─────────────────────────────────────────────

async function setup() {
  console.log("IncidentIQ Setup Script");
  console.log("─────────────────────────────");

  // Verify connection
  console.log("\n Connecting to Elasticsearch...");
  const info = await client.info();
  console.log(`Connected to: ${info.name || info.body?.name || "cluster"} (version ${info.version?.number || info.body?.version?.number || "unknown"})`);

  // Create indexes
  for (const [indexName, indexConfig] of Object.entries(INDEXES)) {
    console.log(`\n📁 Index: ${indexName}`);

    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      console.log(`Already exists. Deleting and recreating...`);
      await client.indices.delete({ index: indexName });
    }

    await client.indices.create({
      index: indexName,
      body: indexConfig,
    });
    console.log(`Created successfully`);
  }

  // Seed known_issues
  console.log("\nSeeding known_issues...");
  const kiOps = KNOWN_ISSUES.flatMap((doc) => [
    { index: { _index: "known_issues", _id: doc.issue_id } },
    doc,
  ]);
  await client.bulk({ body: kiOps, refresh: true });
  console.log(`Inserted ${KNOWN_ISSUES.length} known issues`);

  // Seed past_incidents
  console.log("\nSeeding past_incidents...");
  const piOps = PAST_INCIDENTS.flatMap((doc) => [
    { index: { _index: "past_incidents", _id: doc.incident_id } },
    doc,
  ]);
  await client.bulk({ body: piOps, refresh: true });
  console.log(`Inserted ${PAST_INCIDENTS.length} past incidents`);

  // Seed system_logs
  console.log("\n📝 Generating and seeding system_logs...");
  const logs = generateLogs();
  const logOps = logs.flatMap((doc, i) => [
    { index: { _index: "system_logs", _id: `log-${Date.now()}-${i}` } },
    doc,
  ]);
  await client.bulk({ body: logOps, refresh: true });
  console.log(`Inserted ${logs.length} log entries`);

  // Verify
  console.log("\nVerification:");
  for (const indexName of Object.keys(INDEXES)) {
    const count = await client.count({ index: indexName });
    console.log(`   ${indexName}: ${count.count ?? count.body?.count} documents`);
  }

  console.log("\nSetup complete! Now follow the README to create tools, workflow, and agent in Kibana.");
}

// Run
setup().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
