/**
 * dispute-defender MCP Server (stdio)
 *
 * Exposes dispute-defender's deterministic, anti-fabrication primitives
 * as Model Context Protocol tools so AI agents (Claude Desktop, Cursor,
 * Cline, Continue, etc.) can use them in coding and ops workflows.
 *
 * Tools exposed:
 *   - evaluate_ce3_eligibility   — score a CustomerEvidenceBundle for Visa CE 3.0
 *   - build_ce3_evidence         — assemble the Stripe-shape CE3 payload
 *   - canonical_json_hash        — canonical JSON + SHA-256 (audit primitive)
 *   - verify_manifest_signature  — verify a previously-signed PDF manifest
 *   - describe_dispute_defender  — return high-level capabilities + safety posture
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
 *       "dispute-defender": {
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

// ─── Server identity ──────────────────────────────────────────────────────
const SERVER_INFO = {
  name: '@merchantguard/agentguard-cb',
  version: '0.3.0',
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
      'dispute-defender manifest verification.',
    inputSchema: zodToJsonSchema(canonicalJsonInputSchema),
  },
  {
    name: 'verify_manifest_signature',
    description:
      'Verify an Ed25519 signature over a dispute-defender ManifestPayload. ' +
      'Returns whether the signature is valid for the manifest and public key. ' +
      'Use this to audit-check a previously generated dispute PDF.',
    inputSchema: zodToJsonSchema(verifyManifestInputSchema),
  },
  {
    name: 'describe_dispute_defender',
    description:
      'Return a high-level description of dispute-defender capabilities, the ' +
      'anti-fabrication safety posture, and the patent / license status. Useful ' +
      'as a first call to understand what tools to use for a dispute workflow.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

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
          'is compatible with dispute-defender manifest verification.',
      },
      pdf_manifest: {
        description:
          'Verify Ed25519 signatures over dispute-defender ManifestPayload ' +
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
