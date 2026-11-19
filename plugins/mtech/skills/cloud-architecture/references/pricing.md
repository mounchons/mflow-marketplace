# Pricing: getting numbers you can defend

## Rules

1. **Official source first, dated.** Label each line `official` (Price List API / vendor price page) or `estimate` (search result, third-party, assumption). Estimates are confirmed before a quotation.
2. **Same quantities for every cloud.** Quantities are assumptions in the spec; each cloud sheet multiplies the same assumptions by its own unit prices.
3. **Region matters.** Price the chosen region (local region for data residency); keep the nearest alternative in a note when it helps the decision.
4. **On-demand first, discounts second.** Commitment (Savings Plan / Reserved Instance / CUD) applies only to resources running 24 hours; scaled-out and daytime capacity stays on-demand. Recommend buying after 4–8 weeks of real metrics.
5. **Apply free tiers** that are permanent (CDN 1 TB, data transfer 100 GB, log ingest 5 GB, first 10 alarms, identity MAU tiers) and say so in the note.
6. **Count requests, not just GB.** Object PUT / lifecycle charges are per object: estimate file count from average file size measured on a sample, and ask for the real count.
7. **Hunt the hidden lines:** NAT gateway hours + GB processed, public IPv4 per hour, cross-AZ traffic, load balancer capacity units, CDN requests, WAF requests, log ingest, alarms, synthetic checks, backups copied to another region, retrieval fees of cold tiers, minimum storage durations, support plan.
8. **Separate one-time costs** (bulk upload PUTs, migration instances, VPN during transition) from monthly costs, and monthly into **fixed** (24 h resources) vs **scale** (traffic, data, extra capacity, logs).
9. **Calculator links** go in each cloud sheet so the user can rebuild the estimate on the vendor's site; the vendor calculator may not apply free tiers, so expect its total to be higher.

## AWS: Price List API (no credentials)

```bash
python3 scripts/aws_price.py regions AmazonEC2                      # is the service in the region?
python3 scripts/aws_price.py fetch AmazonEC2 ap-southeast-7 --out awsprice
python3 scripts/aws_price.py query awsprice/AmazonEC2_ap-southeast-7.json \
  --attr instanceType=t3.medium --attr operatingSystem=Linux --attr tenancy=Shared \
  --attr preInstalledSw=NA --attr capacitystatus=Used --attr licenseModel="No License required"
```

Useful service codes: AmazonEC2 (also EBS, NAT gateway via `--family "NAT Gateway"`), AmazonVPC (public IPv4), AWSELB, AmazonRDS, AmazonElastiCache, AmazonS3, AWSLambda, AWSQueueService, AmazonCloudWatch, AWSSecretsManager, AmazonECR, awswaf, AWSDataTransfer, AWSDatabaseMigrationSvc, AWSBackup, AmazonCognito, AWSXRay. Global services (CloudFront, Route 53) price per edge location: use the price page and mark `estimate` when unsure. Use `--show-attrs` with a loose filter to discover attribute values.

## Azure: Retail Prices API (no credentials)

```bash
curl -s "https://prices.azure.com/api/retail/prices?\$filter=serviceName%20eq%20'Virtual%20Machines'%20and%20armRegionName%20eq%20'southeastasia'%20and%20skuName%20eq%20'B2ms'%20and%20priceType%20eq%20'Consumption'"
```

Filter fields: `serviceName`, `armRegionName`, `skuName`, `productName`, `meterName`, `priceType` (`Consumption` / `Reservation`). Follow `NextPageLink` for more pages. If a proxy blocks the host, fall back to search and mark `estimate`.

## Google Cloud: Cloud Billing Catalog API (needs an API key)

```bash
curl -s "https://cloudbilling.googleapis.com/v1/services?key=$GCP_API_KEY"            # find the service id
curl -s "https://cloudbilling.googleapis.com/v1/services/<SERVICE_ID>/skus?key=$GCP_API_KEY&currencyCode=USD"
```

Without a key, read the public pricing pages (`cloud.google.com/<product>/pricing`) and mark the line `official` only when the page states the region's price.

## Fallback: web search

Use the extended search mode for niche or very recent prices (new regions, new tiers). Record the URL and the date in the note; mark `estimate`.

## Spec → workbook

Put assumptions and line items in a spec JSON (format: `examples/cost-spec.example.json`), build with `scripts/cost_workbook.py`, recalculate headless, then read totals back and copy them into README, diagrams and plan. Keep the spec in the project's docs folder next to the workbook so later changes rebuild cleanly.
