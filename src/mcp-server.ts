/**
 * AgentGuard CB MCP Server (stdio)
 *
 * Exposes AgentGuard CB's deterministic, anti-fabrication primitives
 * as Model Context Protocol tools so AI agents (Claude Desktop, Cursor,
 * Cline, Continue, etc.) can use them in coding and ops workflows.
 *
 * Tools exposed:
 *   - evaluate_ce3_eligibility   - score a CustomerEvidenceBundle for Visa CE 3.0
 *   - build_ce3_evidence         - assemble the Stripe-shape CE3 payload
 *   - canonical_json_hash        - canonical JSON + SHA-256 (audit primitive)
 *   - verify_manifest_signature  - verify a previously-signed PDF manifest
 *   - append_event               - append a typed event to the buyer-readable log
 *   - render_event_log           - render the chain as plain English / text / csv / json
 *   - verify_chain               - walk and verify the hash chain for a dispute
 *   - describe_agentguard_cb     - return capabilities + safety posture
 *
 * Scope discipline:
 *   - No tool calls Stripe API, no tool writes to a database, no tool
 *     submits a dispute. The MCP server is read-only and pure-functional
 *     by design. Submission and persistence remain the merchant's job
 *     and the merchant's responsibility, which matches the LEGAL.md
 *     posture.
 *
 * Install (Claude Desktop config):
 *   {
 *     "mcpServers": {
 *       "agentguard-cb": {
 *         "command": "npx",
 *         "args": ["-y", "@merchantguard/agentguard-cb", "mcp"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  evaluateVisaCe3Eligibility,
  buildStripeVisaCe3EnhancedEvidence,
  STRIPE_CE3_MIN_DAYS,
  STRIPE_CE3_MAX_DAYS,
} from '../lib/evidence/ce3';
import { customerEvidenceBundleSchema } from '../lib/evidence/schemas';
import { canonicalJson } from '../lib/audit/log';
import { verifyManifestSignature, sha256Hex } from '../lib/pdf/generate';
import {
  InMemoryEventLogStore,
  renderEvent,
  renderEventLogText,
  renderEventLogCsv,
  verifyChain,
  EVENT_TYPES,
  type EventPayload,
  type EventType,
} from '../lib/event-log';
import { validateBundleSanity } from '../lib/evidence/sanity';
import {
  InMemoryOutcomeRecorder,
  type DisputeFinalOutcome,
} from '../lib/outcomes';

// ─── Server identity ──────────────────────────────────────────────────────
const SERVER_INFO = {
  name: '@merchantguard/agentguard-cb',
  version: '1.2.0',
};

// ─── Logging (MUST go to stderr; stdio MCP uses stdout for JSON-RPC) ──────
const log = (msg: string, meta?: Record<string, unknown>) => {
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  process.stderr.write(`[agentguard-cb mcp] ${line}\n`);
};

// ─── Tool input schemas ───────────────────────────────────────────────────

const evaluateCe3InputSchema = z.object({
  bundle: z
    .unknown()
    .describe(
      'A CustomerEvidenceBundle object: { customer, disputedTransaction, ' +
        'priorUndisputedTransactions[], loginEvents[], productUsageEvents[], ' +
        'refundEvents[], communicationEvents[], deliveryProofs[], ' +
        'termsAcceptance, refundPolicy }. Validated against ' +
        'customerEvidenceBundleSchema before evaluation.',
    ),
});

const buildCe3EvidenceInputSchema = z.object({
  bundle: z
    .unknown()
    .describe(
      'A CustomerEvidenceBundle object. Same shape as evaluate_ce3_eligibility. ' +
        'Internally we evaluate eligibility, then if qualified, assemble the ' +
        'Stripe Disputes API enhanced_evidence payload from the two priors that ' +
        'were selected by the matching algorithm.',
    ),
});

const canonicalJsonInputSchema = z.object({
  payload: z
    .unknown()
    .describe(
      'Any JSON-serializable value. Returned canonical form has stable key ' +
        'ordering and stable number formatting so the SHA-256 hash is ' +
        'reproducible across machines and SDKs.',
    ),
});

const appendEventInputSchema = z.object({
  disputeId: z
    .string()
    .min(1)
    .describe('The dispute this event belongs to. Free-form merchant identifier.'),
  type: z
    .enum(EVENT_TYPES)
    .describe(`One of: ${EVENT_TYPES.join(', ')}.`),
  data: z
    .unknown()
    .describe(
      'Typed payload for the chosen event type. Shape is enforced at runtime: ' +
        'see lib/event-log/types.ts for the per-type zod schemas.',
    ),
  actor: z
    .string()
    .min(1)
    .describe(
      'Free-form actor string, e.g. "system:agentguard-cb", ' +
        '"agent:cursor-claude-3.5", "user:jp@merchantguard.ai".',
    ),
  signingSeedHex: z
    .string()
    .optional()
    .describe(
      'Optional 64-char hex Ed25519 seed. If provided, the appended event is ' +
        'signed and the signer key id is derived deterministically from it.',
    ),
  timestamp: z
    .string()
    .optional()
    .describe('Optional ISO 8601 UTC timestamp; defaults to now.'),
});

const renderEventLogInputSchema = z.object({
  disputeId: z
    .string()
    .min(1)
    .describe('The dispute whose event log to render.'),
  format: z
    .enum(['json', 'text', 'csv'])
    .describe(
      'json = array of RenderedEvent objects; text = multi-line plain English ' +
        '(boring version, finance/legal); csv = spreadsheet export.',
    ),
});

const verifyChainInputSchema = z.object({
  disputeId: z
    .string()
    .min(1)
    .describe('The dispute whose chain to verify.'),
  publicKeyHex: z
    .string()
    .optional()
    .describe(
      'Optional Ed25519 public key (hex) to verify signatures against. ' +
        'If omitted, only hash-chain integrity is checked, not signatures.',
    ),
});

const validateBundleSanityInputSchema = z.object({
  bundle: z
    .unknown()
    .describe(
      'A CustomerEvidenceBundle object. Same shape as evaluate_ce3_eligibility. ' +
        'Returns a list of findings (block / warn / info severity) for ' +
        'logically-impossible or suspicious states. Pure deterministic logic; ' +
        'no LLM, no fabrication scoring. Findings sorted block first.',
    ),
});

const recordDisputeOutcomeInputSchema = z.object({
  disputeId: z.string().min(1).describe('The Stripe dispute ID (dp_*).'),
  outcome: z
    .enum(['won', 'lost', 'withdrawn', 'pending', 'unknown'])
    .describe('Final outcome of the dispute.'),
  evidencePacketHash: z
    .string()
    .optional()
    .describe('Hash of the canonical evidence packet that was submitted.'),
  eligibilityStatusAtSubmission: z
    .enum(['qualified', 'requires_action', 'not_qualified'])
    .optional()
    .describe('Stripe-reported eligibility at time of submission.'),
  merchantLocale: z
    .string()
    .optional()
    .describe('Locale of the merchant who submitted (e.g. en, es-MX, pt-BR).'),
  merchantNotes: z
    .string()
    .optional()
    .describe('Free-form notes. MUST NOT include cardholder PII.'),
  wasVisaCe3: z.boolean().optional().describe('Whether dispute was Visa CE 3.0.'),
  disputeAmountUsdCents: z
    .number()
    .int()
    .optional()
    .describe('Dispute amount in USD cents.'),
});

const listDisputeOutcomesInputSchema = z.object({
  outcome: z
    .enum(['won', 'lost', 'withdrawn', 'pending', 'unknown'])
    .optional()
    .describe('Filter by outcome category.'),
  merchantLocale: z
    .string()
    .optional()
    .describe('Filter by locale (e.g. en, es-MX, pt-BR).'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Max number of records to return. Default 100.'),
});

const verifyManifestInputSchema = z.object({
  manifest: z
    .object({
      schemaVersion: z.literal('1'),
      adapterName: z.string(),
      adapterVersion: z.string(),
      disputeId: z.string(),
      stripeDisputeId: z.string(),
      stripeChargeId: z.string(),
      reasonCode: z.string(),
      bundleSha256: z.string(),
      pdfSha256: z.string(),
      ce3Eligibility: z
        .object({ qualified: z.boolean(), reasons: z.array(z.string()) })
        .nullable(),
      createdAt: z.string(),
      signingKeyId: z.string(),
    })
    .describe('The unsigned ManifestPayload that was originally signed.'),
  signature: z
    .string()
    .describe(
      'The Ed25519 signature over the canonical JSON of manifest, hex-encoded.',
    ),
  publicKey: z
    .string()
    .describe('The Ed25519 public key that signed the manifest, hex-encoded.'),
});

// ─── Tool definitions for ListTools response ──────────────────────────────

const tools = [
  {
    name: 'evaluate_ce3_eligibility',
    description:
      'Evaluate whether a CustomerEvidenceBundle qualifies for Visa Compelling ' +
      'Evidence 3.0 enhanced evidence. Returns the eligibility verdict, the ' +
      'reasoning, and the two selected prior undisputed transactions if qualified. ' +
      'Read-only and pure-functional. Does not contact Stripe.',
    inputSchema: zodToJsonSchema(evaluateCe3InputSchema),
  },
  {
    name: 'build_ce3_evidence',
    description:
      'Assemble the Stripe Disputes API enhanced_evidence payload for a Visa ' +
      'CE 3.0 submission. Internally evaluates eligibility first; if qualified, ' +
      'builds the payload using the two priors selected by the matching algorithm. ' +
      'Returns the typed payload in the exact shape Stripe expects. Does NOT ' +
      "call the Stripe API; the merchant's own code submits the result with " +
      'submit:false for human review before final submission.',
    inputSchema: zodToJsonSchema(buildCe3EvidenceInputSchema),
  },
  {
    name: 'canonical_json_hash',
    description:
      'Return the canonical JSON serialization and SHA-256 hex digest of any ' +
      'JSON-serializable value. Use this primitive to chain evidence ' +
      'commitments into your own audit log in a way compatible with ' +
      'AgentGuard CB manifest verification.',
    inputSchema: zodToJsonSchema(canonicalJsonInputSchema),
  },
  {
    name: 'verify_manifest_signature',
    description:
      'Verify an Ed25519 signature over a AgentGuard CB ManifestPayload. ' +
      'Returns whether the signature is valid for the manifest and public key. ' +
      'Use this to audit-check a previously generated dispute PDF.',
    inputSchema: zodToJsonSchema(verifyManifestInputSchema),
  },
  {
    name: 'append_event',
    description:
      'Append a typed event to the buyer-readable event log for a dispute. ' +
      'The event is hash-chained to the previous event in the same disputeId; ' +
      "if a signingSeedHex is provided, it is also Ed25519-signed. Returns the " +
      'full Event including hash and (optional) signature. The log is in-memory ' +
      'in the MCP process: production users plug in a persistent EventLogStore.',
    inputSchema: zodToJsonSchema(appendEventInputSchema),
  },
  {
    name: 'render_event_log',
    description:
      "Render a dispute's hash-chained event log in a human-readable form. " +
      'format=text is the boring version that finance/legal read like a bank ' +
      'statement; format=csv is the spreadsheet export; format=json returns ' +
      'an array of RenderedEvent objects with drill-down handles to the raw ' +
      'signed payloads.',
    inputSchema: zodToJsonSchema(renderEventLogInputSchema),
  },
  {
    name: 'verify_chain',
    description:
      "Walk a dispute's event chain and report tamper-evidence. Returns " +
      '{eventsChecked, hashChainValid, signaturesChecked, signaturesValid, ' +
      'errors}. If publicKeyHex is provided, signatures are verified too; ' +
      'otherwise only hash-chain integrity is checked. Pure-functional and ' +
      'never throws.',
    inputSchema: zodToJsonSchema(verifyChainInputSchema),
  },
  {
    name: 'validate_bundle_sanity',
    description:
      'Run logical-consistency checks on a CustomerEvidenceBundle BEFORE ' +
      'staging. Returns findings sorted by severity (block / warn / info). ' +
      'Catches structurally-valid-but-impossible states like signupTimestamp ' +
      'AFTER the disputed transaction, priors outside the 120-364 day window, ' +
      'or wasDisputed=true on a prior. Pure deterministic logic; no LLM, no ' +
      'fabrication scoring. Merchant decides whether to proceed.',
    inputSchema: zodToJsonSchema(validateBundleSanityInputSchema),
  },
  {
    name: 'record_dispute_outcome',
    description:
      'Record the final outcome (won/lost/withdrawn/pending) for a dispute ' +
      'in the in-memory outcome recorder for this MCP session. Production ' +
      'users plug in PostgresOutcomeRecorder via the lib API for persistence. ' +
      'Outcome capture is OPT-IN; the publisher does not collect outcomes. ' +
      'Recorded outcomes never leave the merchant infrastructure.',
    inputSchema: zodToJsonSchema(recordDisputeOutcomeInputSchema),
  },
  {
    name: 'list_dispute_outcomes',
    description:
      'List recorded outcomes from the in-memory outcome recorder. Optional ' +
      'filters: outcome category, merchant locale, limit. Use this to inspect ' +
      'what was recorded during the current MCP session.',
    inputSchema: zodToJsonSchema(listDisputeOutcomesInputSchema),
  },
  {
    name: 'describe_agentguard_cb',
    description:
      'Return a high-level description of AgentGuard CB capabilities, the ' +
      'anti-fabrication safety posture, and the patent / license status. Useful ' +
      'as a first call to understand what tools to use for a dispute workflow.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ─── Process-level event-log store ────────────────────────────────────────
// MCP servers are long-lived stdio processes. Keep a single store across
// tool calls so an agent can append, render, and verify within one session.
// Production users swap in a persistent EventLogStore via the lib API.
const eventStore = new InMemoryEventLogStore();

// ─── Process-level outcome recorder ───────────────────────────────────────
// In-memory recorder for this MCP session. Production users plug in a
// PostgresOutcomeRecorder via the lib API for persistent storage.
const outcomeRecorder = new InMemoryOutcomeRecorder();

// ─── Tool handlers ────────────────────────────────────────────────────────

function ok(result: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

function fail(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

async function handleEvaluateCe3(args: unknown): Promise<CallToolResult> {
  const wrapped = evaluateCe3InputSchema.safeParse(args);
  if (!wrapped.success) return fail(`Invalid input: ${wrapped.error.message}`);
  const bundleParse = customerEvidenceBundleSchema.safeParse(wrapped.data.bundle);
  if (!bundleParse.success) {
    return fail(`bundle failed schema validation: ${bundleParse.error.message}`);
  }
  try {
    const result = evaluateVisaCe3Eligibility(bundleParse.data);
    return ok(result);
  } catch (err) {
    return fail(`evaluateVisaCe3Eligibility threw: ${(err as Error).message}`);
  }
}

async function handleBuildCe3Evidence(args: unknown): Promise<CallToolResult> {
  const wrapped = buildCe3EvidenceInputSchema.safeParse(args);
  if (!wrapped.success) return fail(`Invalid input: ${wrapped.error.message}`);
  const bundleParse = customerEvidenceBundleSchema.safeParse(wrapped.data.bundle);
  if (!bundleParse.success) {
    return fail(`bundle failed schema validation: ${bundleParse.error.message}`);
  }
  try {
    const eligibility = evaluateVisaCe3Eligibility(bundleParse.data);
    if (!eligibility.qualified) {
      return ok({
        qualified: false,
        reasons: eligibility.reasons,
        payload: null,
        note:
          'Bundle did not qualify for CE 3.0; no payload built. See reasons. ' +
          'Re-run with a bundle that has 2+ matching prior transactions in the ' +
          `${STRIPE_CE3_MIN_DAYS}-${STRIPE_CE3_MAX_DAYS} day window.`,
      });
    }
    const payload = buildStripeVisaCe3EnhancedEvidence(
      bundleParse.data,
      eligibility.selectedPriors,
    );
    return ok({
      qualified: true,
      reasons: eligibility.reasons,
      selectedPriors: eligibility.selectedPriors.map(p => p.stripeChargeId ?? p),
      payload,
      note:
        'This is the enhanced_evidence payload Stripe expects. Submit via your ' +
        'own Stripe SDK call to dispute.update. Recommended: use submit:false ' +
        'on first call so a human can review before final submission.',
    });
  } catch (err) {
    return fail(`buildStripeVisaCe3EnhancedEvidence threw: ${(err as Error).message}`);
  }
}

async function handleCanonicalJsonHash(args: unknown): Promise<CallToolResult> {
  const parsed = canonicalJsonInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  try {
    const canonical = canonicalJson(parsed.data.payload);
    const sha256 = sha256Hex(Buffer.from(canonical, 'utf8'));
    return ok({
      canonical,
      sha256_hex: sha256,
      byte_length: Buffer.byteLength(canonical, 'utf8'),
    });
  } catch (err) {
    return fail(`canonical_json_hash threw: ${(err as Error).message}`);
  }
}

async function handleVerifyManifest(args: unknown): Promise<CallToolResult> {
  const parsed = verifyManifestInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  try {
    const verified = await verifyManifestSignature({
      manifest: parsed.data.manifest,
      signature: parsed.data.signature,
      publicKey: parsed.data.publicKey,
    });
    return ok({
      valid: verified,
      verified_manifest: verified ? parsed.data.manifest : null,
    });
  } catch (err) {
    return fail(`verifyManifestSignature threw: ${(err as Error).message}`);
  }
}

async function handleAppendEvent(args: unknown): Promise<CallToolResult> {
  const parsed = appendEventInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  const { disputeId, type, data, actor, signingSeedHex, timestamp } = parsed.data;
  try {
    const payload = { type, data } as EventPayload;
    const event = await eventStore.append({
      payload,
      actor,
      disputeId,
      timestamp,
      signingSeedHex,
    });
    return ok({
      event,
      rendered: renderEvent(event),
    });
  } catch (err) {
    return fail(`append_event threw: ${(err as Error).message}`);
  }
}

async function handleRenderEventLog(args: unknown): Promise<CallToolResult> {
  const parsed = renderEventLogInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  const { disputeId, format } = parsed.data;
  try {
    const events = await eventStore.list(disputeId);
    if (format === 'json') {
      return ok({
        disputeId,
        eventCount: events.length,
        events: events.map(renderEvent),
      });
    }
    if (format === 'text') {
      return ok({
        disputeId,
        eventCount: events.length,
        text: renderEventLogText(events),
      });
    }
    return ok({
      disputeId,
      eventCount: events.length,
      csv: renderEventLogCsv(events),
    });
  } catch (err) {
    return fail(`render_event_log threw: ${(err as Error).message}`);
  }
}

async function handleVerifyChain(args: unknown): Promise<CallToolResult> {
  const parsed = verifyChainInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  const { disputeId, publicKeyHex } = parsed.data;
  try {
    const events = await eventStore.list(disputeId);
    const result = await verifyChain(disputeId, events, publicKeyHex);
    return ok(result);
  } catch (err) {
    return fail(`verify_chain threw: ${(err as Error).message}`);
  }
}

async function handleValidateBundleSanity(args: unknown): Promise<CallToolResult> {
  const wrapped = validateBundleSanityInputSchema.safeParse(args);
  if (!wrapped.success) return fail(`Invalid input: ${wrapped.error.message}`);
  const bundleParse = customerEvidenceBundleSchema.safeParse(wrapped.data.bundle);
  if (!bundleParse.success) {
    return fail(`bundle failed schema validation: ${bundleParse.error.message}`);
  }
  try {
    const result = validateBundleSanity(bundleParse.data);
    return ok({
      passed: result.passed,
      findingCount: result.findings.length,
      findings: result.findings,
      summary: result.passed
        ? 'No block-severity findings. Merchant may proceed to stage.'
        : 'Bundle has block-severity findings. Stripe is likely to reject. Review fields and re-run.',
    });
  } catch (err) {
    return fail(`validateBundleSanity threw: ${(err as Error).message}`);
  }
}

async function handleRecordDisputeOutcome(args: unknown): Promise<CallToolResult> {
  const parsed = recordDisputeOutcomeInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  try {
    const record = {
      disputeId: parsed.data.disputeId,
      outcome: parsed.data.outcome as DisputeFinalOutcome,
      recordedAt: new Date(),
      evidencePacketHash: parsed.data.evidencePacketHash,
      eligibilityStatusAtSubmission: parsed.data.eligibilityStatusAtSubmission,
      merchantLocale: parsed.data.merchantLocale,
      merchantNotes: parsed.data.merchantNotes,
      wasVisaCe3: parsed.data.wasVisaCe3,
      disputeAmountUsdCents: parsed.data.disputeAmountUsdCents,
    };
    await outcomeRecorder.record(record);
    return ok({
      recorded: true,
      record,
      note:
        'Recorded in in-memory outcome recorder for this MCP session. For ' +
        'persistence across restarts, wire PostgresOutcomeRecorder in your own ' +
        'application code (see docs/migrations/agentguard_cb_dispute_outcomes.sql).',
    });
  } catch (err) {
    return fail(`record_dispute_outcome threw: ${(err as Error).message}`);
  }
}

async function handleListDisputeOutcomes(args: unknown): Promise<CallToolResult> {
  const parsed = listDisputeOutcomesInputSchema.safeParse(args);
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`);
  try {
    const records = await outcomeRecorder.list({
      outcome: parsed.data.outcome,
      merchantLocale: parsed.data.merchantLocale,
      limit: parsed.data.limit ?? 100,
    });
    return ok({
      count: records.length,
      records,
    });
  } catch (err) {
    return fail(`list_dispute_outcomes threw: ${(err as Error).message}`);
  }
}

async function handleDescribe(): Promise<CallToolResult> {
  return ok({
    name: '@merchantguard/agentguard-cb',
    version: SERVER_INFO.version,
    license: 'MIT',
    repository: 'https://github.com/MerchantGuard/agentguard-cb',
    npm: 'https://www.npmjs.com/package/@merchantguard/agentguard-cb',
    capabilities: {
      visa_ce3: {
        description:
          'Evaluate CustomerEvidenceBundle objects for Visa Compelling Evidence ' +
          '3.0 eligibility and assemble the Stripe-shape enhanced_evidence payload.',
        prior_window_days: { min: STRIPE_CE3_MIN_DAYS, max: STRIPE_CE3_MAX_DAYS },
      },
      audit_chain: {
        description:
          'Ed25519 hash-chained audit primitives. Returns canonical JSON + ' +
          'SHA-256 so callers can build a reproducible commitment chain that ' +
          'is compatible with AgentGuard CB manifest verification.',
      },
      pdf_manifest: {
        description:
          'Verify Ed25519 signatures over AgentGuard CB ManifestPayload ' +
          'objects produced by generateDisputePdf. Useful for auditing a ' +
          'previously-generated evidence bundle.',
      },
    },
    safety_posture: {
      no_fabricated_evidence: true,
      no_llm_evidence_generation: true,
      no_dispute_submission_from_mcp: true,
      default_human_review: true,
      legal_doc:
        'https://github.com/MerchantGuard/agentguard-cb/blob/main/LEGAL.md',
      anti_fabrication_doc:
        'https://github.com/MerchantGuard/agentguard-cb/blob/main/DISCLAIMER.md',
    },
    patent_status: {
      provisionals_filed: ['63/983,615', '63/983,621', '63/983,843', '63/984,626'],
      assignee: 'Dunecrest Ventures Inc.',
      filed: '2026-02-17',
      patents_doc:
        'https://github.com/MerchantGuard/agentguard-cb/blob/main/PATENTS.md',
    },
  });
}

// ─── zod -> JSON Schema (minimal converter sufficient for MCP listTools) ──
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToSchema(value);
      if (!value.isOptional()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  return { type: 'object' };
}

function zodFieldToSchema(field: z.ZodTypeAny): Record<string, unknown> {
  const description = field.description;
  let base: Record<string, unknown> = {};
  if (field instanceof z.ZodString) base = { type: 'string' };
  else if (field instanceof z.ZodNumber) base = { type: 'number' };
  else if (field instanceof z.ZodBoolean) base = { type: 'boolean' };
  else if (field instanceof z.ZodEnum) {
    base = { type: 'string', enum: (field as z.ZodEnum<[string, ...string[]]>).options };
  } else if (field instanceof z.ZodLiteral) {
    base = { const: (field as z.ZodLiteral<unknown>).value };
  }
  else if (field instanceof z.ZodArray) {
    base = { type: 'array', items: zodFieldToSchema(field.element) };
  } else if (field instanceof z.ZodObject) {
    const shape = field.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(shape)) properties[k] = zodFieldToSchema(v);
    base = { type: 'object', properties };
  } else if (field instanceof z.ZodOptional) {
    return zodFieldToSchema(field.unwrap());
  } else if (field instanceof z.ZodUnknown) {
    base = {};
  } else if (field instanceof z.ZodRecord) {
    base = { type: 'object', additionalProperties: true };
  } else {
    base = {};
  }
  if (description) (base as Record<string, unknown>).description = description;
  return base;
}

// ─── Boot ─────────────────────────────────────────────────────────────────

async function main() {
  const server = new Server(
    { name: SERVER_INFO.name, version: SERVER_INFO.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`tool_call`, { name });
    try {
      switch (name) {
        case 'evaluate_ce3_eligibility':
          return await handleEvaluateCe3(args);
        case 'build_ce3_evidence':
          return await handleBuildCe3Evidence(args);
        case 'canonical_json_hash':
          return await handleCanonicalJsonHash(args);
        case 'verify_manifest_signature':
          return await handleVerifyManifest(args);
        case 'append_event':
          return await handleAppendEvent(args);
        case 'render_event_log':
          return await handleRenderEventLog(args);
        case 'verify_chain':
          return await handleVerifyChain(args);
        case 'validate_bundle_sanity':
          return await handleValidateBundleSanity(args);
        case 'record_dispute_outcome':
          return await handleRecordDisputeOutcome(args);
        case 'list_dispute_outcomes':
          return await handleListDisputeOutcomes(args);
        case 'describe_agentguard_cb':
        case 'describe_dispute_defender':
          return await handleDescribe();
        default:
          return fail(`Unknown tool: ${name}`);
      }
    } catch (err) {
      log(`tool_error`, { name, error: (err as Error).message });
      return fail(`Tool ${name} threw: ${(err as Error).message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready`, { name: SERVER_INFO.name, version: SERVER_INFO.version });
}

main().catch((err) => {
  log(`fatal`, { error: (err as Error).message });
  process.exit(1);
});
