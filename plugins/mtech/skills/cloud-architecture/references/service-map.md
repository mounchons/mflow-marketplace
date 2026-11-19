# Service map: AWS · Azure · Google Cloud

Names differ per cloud; compare by function. Verify that each service exists in the chosen region before pricing (newer local regions such as AWS `ap-southeast-7` Bangkok lack some services: check `aws_price.py regions <ServiceCode>`).

| Function | AWS | Azure | Google Cloud |
|---|---|---|---|
| VM | EC2 | Virtual Machines | Compute Engine |
| Containers on own VMs | ECS on EC2 (capacity provider) | AKS | GKE (zonal = free control plane) |
| Serverless containers | ECS Fargate / App Runner | Container Apps | Cloud Run |
| Load balancer (L7) | Application Load Balancer | Application Gateway / Front Door | Cloud Load Balancing |
| CDN + WAF | CloudFront + AWS WAF (+ Shield Std) | Front Door **Premium** for managed WAF rules (Standard = custom rules only) | Cloud CDN + Cloud Armor |
| DNS | Route 53 | Azure DNS | Cloud DNS |
| TLS certificates | ACM (free; CloudFront / Cognito certs in us-east-1) | Front Door / App Service managed certs | Google-managed certs |
| PostgreSQL | RDS for PostgreSQL / Aurora | Database for PostgreSQL Flexible Server | Cloud SQL for PostgreSQL |
| SQL Server (rehost) | RDS for SQL Server | Azure SQL / SQL MI | Cloud SQL for SQL Server |
| Redis / Valkey | ElastiCache (Valkey) | Azure Cache for Redis | Memorystore |
| Object storage hot / cold | S3 Standard / Glacier Instant Retrieval / Deep Archive | Blob Hot / Cold / Archive | Standard / Coldline / Archive |
| Queue | SQS (+ DLQ) | Service Bus / Storage Queue | Pub/Sub |
| Functions | Lambda | Functions | Cloud Run functions |
| Scheduler | EventBridge Scheduler | Logic Apps / Container Apps jobs | Cloud Scheduler |
| Secrets | Secrets Manager / Parameter Store | Key Vault | Secret Manager |
| Image registry | ECR | ACR | Artifact Registry |
| Logs / metrics / alarms | CloudWatch Logs + Alarms | Azure Monitor + Log Analytics | Cloud Logging + Monitoring |
| Synthetic checks | CloudWatch Synthetics | Application Insights availability tests | Uptime checks |
| Tracing | X-Ray / OpenTelemetry | Application Insights | Cloud Trace |
| Audit trail | CloudTrail (+ Object Lock archive) | Activity Log | Cloud Audit Logs |
| Threat detection | GuardDuty | Defender for Cloud | Security Command Center |
| Backup | AWS Backup | Azure Backup | Backup and DR |
| User login / OAuth | Cognito (Essentials free to 10k MAU) | Entra External ID | Identity Platform |
| Email | SES (sandbox → request production) | Communication Services Email | partner (SendGrid etc.) |
| NAT / static egress IP | NAT Gateway + Elastic IP | NAT Gateway + public IP | Cloud NAT + static IP |
| Private access to storage | S3 Gateway Endpoint (free) | Private Endpoint | Private Google Access |
| Remote access | Client VPN / Verified Access / self-run WireGuard | VPN Gateway P2S | Cloud VPN / IAP |
| DB migration | DMS (or own dump / restore) | DMS (check engine pair) | Database Migration Service |
| Bulk file transfer | own uploader (SDK) / DataSync / Snowball | AzCopy / Data Box | Storage Transfer Service / Transfer Appliance |

## Design checklist for the target

- **Edge:** single entry (CDN + WAF), managed rule groups, rate limit on login, TLS 1.2+, origin locked to the CDN (prefix list + secret header).
- **Network:** public (LB, NAT) / private app / private data subnets in 2 AZ; no SSH (session manager); storage via gateway endpoint so traffic skips NAT.
- **Compute:** containers behind the LB, path-based routing, service auto scaling + capacity scaling, scheduled day / night sizes; bridge networking when small VMs host many tasks (ENI limits).
- **Data:** managed DB with PITR, deletion protection, encryption; cache sized from real working set; object storage lifecycle by file age (hot → cold), versioning.
- **Identity:** staff and apps via OAuth + MFA by role; partners via the app's own API tokens; IP allow-list for internal-only areas (WAF IP set + role check in the app).
- **Observability:** log every layer, one TraceId across layers, audit log in the app, alert catalog with Critical / Warning / Info routing, archive in a separate account with Object Lock.
- **Resilience:** backup + restore test with measured RTO / RPO, infra as code to rebuild, documented rollback.
