# Security policy

## Reporting a vulnerability

Email **security@merchantguard.ai** with details. Do not file public GitHub issues for security-sensitive findings.

We aim to acknowledge reports within 72 hours. Disclosure timelines depend on severity and scope.

## Supported versions

Only the `main` branch is supported. Pre-release tags and forks receive no security backports.

## PII handling

This software processes payment-related personally identifiable information (PII) including customer email, IP, device identifiers, and shipping addresses. Operators MUST:

- Configure the database with appropriate encryption at rest.
- Restrict access to the database, the Stripe API key, and the `DISPUTE_SIGNING_KEY` to administrators with documented operational need.
- Document a lawful basis for processing PII under GDPR / CCPA / similar (see `LEGAL.md`).
- Rotate `DISPUTE_SIGNING_KEY` and `STRIPE_WEBHOOK_SECRET` periodically.

## Secret management

Never commit `.env`, `.env.local`, signing keys, or API keys to version control. `.gitignore` is configured to exclude them; verify in CI.

## Webhook signature verification

Stripe webhook handler runs on Node runtime (NOT Edge) per Stripe's raw-body signature requirement. Edits that change the webhook route's runtime, body parsing, or signature verification ARE security-sensitive — require careful review.

## Audit log integrity

The `audit_log` table is append-only at the application layer. The hash chain (`previous_hash` + `entry_hash`) provides tamper evidence. Operators may wish to additionally:

- Replicate audit_log to write-once storage (e.g. S3 Object Lock, GCS bucket retention policy).
- Periodically verify the hash chain end-to-end.
- Ship audit_log entries to an external SIEM.

## Anti-fabrication CI guards

CI fails on:

- Runtime imports of `openai`, `anthropic`, `langchain`, `@langchain/*`, `ai`.
- Schema fields named `narrative`, `freeform`, `generatedText`, `aiSummary`, `llm`.
- New use of `uncategorized_text` in submission code.
- New use of `as any` outside the documented Stripe type-boundary file.

PRs that bypass these guards must be rejected.
