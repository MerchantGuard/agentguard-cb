# Audit log

`audit_log` is append-only at the application layer. Each entry stores a SHA-256 hash chained against the previous entry's hash, providing tamper evidence.

## Entry shape

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `dispute_id` | FK to `disputes.id`; nullable for system-level events |
| `event_type` | One of the documented event types below |
| `payload_sha256` | SHA-256 of the relevant payload (adapter response, PDF bytes, etc.) |
| `previous_hash` | The `entry_hash` of the most recent prior entry; NULL for the first entry |
| `entry_hash` | `sha256(previous_hash || canonical_json(this_entry))` |
| `actor_type` | `system` / `webhook` / `admin` / `job_processor` |
| `actor_id` | actor identifier (e.g. admin user ID); nullable |
| `meta` | JSONB with event-specific context |
| `created_at` | timestamp |

## Event types

| event_type | When | What's hashed |
|---|---|---|
| `webhook_received` | Stripe webhook accepted (signature verified, first time seeing event ID) | Stripe event ID |
| `webhook_replay_ignored` | Same Stripe event ID seen again | Stripe event ID |
| `dispute_record_upserted` | `disputes` row created or updated from webhook | Stripe dispute ID |
| `job_enqueued` | Job inserted into `dispute_jobs` | (none) |
| `adapter_response_hashed` | Adapter returned bundle, before PDF | `bundle_sha256` |
| `ce3_eligibility_checked` | CE 3.0 eligibility evaluated | (none; result in meta) |
| `pdf_generated` | PDF bytes finalized | `pdf_sha256` |
| `pdf_manifest_signed` | Ed25519 signature created over manifest | `pdf_sha256` |
| `stripe_file_uploaded` | PDF uploaded to Stripe Files API | `pdf_sha256` |
| `evidence_staged_on_stripe` | `disputes.update({submit:false})` called | `pdf_sha256` |
| `human_review_approved` | Admin clicked "approve" in dashboard | (none) |
| `evidence_submitted_to_stripe` | `disputes.update({submit:true})` called | `pdf_sha256` |
| `unsupported_reason_code` | Webhook for a reason code the tool doesn't auto-handle | Stripe dispute ID |
| `manual_review_required` | Job processor flagged a dispute for human-only handling | (none) |

## Hash chain verification

```ts
import { canonicalJson, sha256Hex } from '@/lib/audit/log';

let previousHash = '';
for (const row of rowsOrdered) {
  const expected = sha256Hex(previousHash + canonicalJson({
    eventType: row.eventType,
    disputeId: row.disputeId,
    payloadSha256: row.payloadSha256,
    actorType: row.actorType,
    actorId: row.actorId,
    meta: row.meta,
    timestamp: row.createdAt.toISOString(),
  }));
  if (expected !== row.entryHash) throw new Error(`hash chain broken at row ${row.id}`);
  previousHash = row.entryHash;
}
```

## What the chain proves

- An entry cannot be modified without invalidating all subsequent `entry_hash` values.
- An entry cannot be deleted from the middle without breaking continuity.
- New entries CAN be appended (that's the design).
- The chain does NOT prove an entry was created by a specific actor — that's what `actor_type` + `actor_id` are for, but those fields are not cryptographically attested.

For stronger guarantees:
- Ship rows to write-once external storage (S3 Object Lock).
- Have multiple parties co-sign the chain root periodically.
