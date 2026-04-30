# Deploy to Vercel + Supabase

Reference deployment for dispute-defender.

## 1. Provision Supabase

1. Create project at <https://supabase.com>.
2. Copy the connection string from Settings → Database → Connection string (use the "Transaction" pool URL for serverless).
3. Set `DATABASE_URL` in Vercel project env vars.

## 2. Run migrations

```bash
npm run db:generate   # builds drizzle migrations
npm run db:migrate    # applies them
```

## 3. Generate signing key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set as `DISPUTE_SIGNING_KEY` in Vercel env vars.

## 4. Generate admin + job processor secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ADMIN_TOKEN
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # JOB_PROCESSOR_SECRET
```

## 5. Deploy

```bash
vercel deploy --prod
```

## 6. Configure Stripe webhook

In Stripe Dashboard → Developers → Webhooks:

- Endpoint URL: `https://<your-vercel-domain>.vercel.app/api/webhooks/stripe`
- Events:
  - `charge.dispute.created`
  - `charge.dispute.updated`
  - `charge.dispute.closed`

Copy the signing secret and set as `STRIPE_WEBHOOK_SECRET` in Vercel env.

## 7. Configure Vercel Cron (job processor)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/jobs/process",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

Vercel Cron POSTs to the path; for auth, use a `vercel-cron`-aware handler OR rotate `JOB_PROCESSOR_SECRET` and configure a custom header via Vercel's project settings.

## 8. Smoke test

```bash
curl -X POST https://<your-vercel-domain>.vercel.app/api/jobs/process \
  -H "Authorization: Bearer ${JOB_PROCESSOR_SECRET}"
```

Should return `{"claimed": 0, "succeeded": 0, "failed": 0, "errors": []}` if no jobs are queued.

## 9. PDF storage

The default reference implementation expects the job processor to write generated PDF bytes to a path stored in `pdf_artifacts.storage_path`. Production deployments should swap this for an object store (S3, GCS, Vercel Blob) — see `app/api/disputes/[id]/submit/route.ts` for the consumer side and replace `fs.readFile(pdf.storagePath)` with the appropriate fetch.

## 10. Audit log durability

For tamper-evidence beyond the application-layer hash chain, consider:

- Replicating `audit_log` to write-once storage (S3 Object Lock).
- Streaming entries to an external SIEM.
- Periodic hash-chain verification job.

See `SECURITY.md`.
