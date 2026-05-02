/**
 * Hash-chain primitives for the event log.
 *
 * Each event's hash = sha256(canonicalJson(payload) || prevHash || timestamp || actor || disputeId).
 * Chain verification walks events in chronological order, rebuilds each
 * hash, and compares; if a single byte was tampered with, the chain
 * breaks at that event and all subsequent events.
 *
 * Optional Ed25519 signing binds each event's hash to a signer key
 * identity. Signing is OPTIONAL because self-host users may run without
 * a key (chain still hashes, just no signature). Hosted users get key
 * management out of the box.
 */

import * as ed from '@noble/ed25519';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../audit/log';
import type { Event, EventPayload, ChainVerificationResult } from './types';

/** Compute SHA-256 hex of a Buffer. */
function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Compute the canonical hash of a single event, given the previous
 *  event's hash. This is the function the entire chain verification
 *  walks. */
export function computeEventHash(args: {
  payload: EventPayload;
  prevHash: string;
  timestamp: string;
  actor: string;
  disputeId: string;
}): string {
  const canonical = canonicalJson({
    payload: args.payload,
    prevHash: args.prevHash,
    timestamp: args.timestamp,
    actor: args.actor,
    disputeId: args.disputeId,
  });
  return sha256Hex(Buffer.from(canonical, 'utf8'));
}

/** Sign a hash with an Ed25519 32-byte seed. Returns { signature, signerKeyId }. */
export async function signHash(hashHex: string, seedHex: string): Promise<{
  signature: string;
  signerKeyId: string;
}> {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) {
    throw new Error('seedHex must be 64 hex chars (32-byte Ed25519 seed)');
  }
  const seed = Buffer.from(seedHex, 'hex');
  const publicKey = await ed.getPublicKeyAsync(seed);
  const signerKeyId = sha256Hex(Buffer.from(publicKey)).slice(0, 16);
  const sig = await ed.signAsync(Buffer.from(hashHex, 'hex'), seed);
  return {
    signature: Buffer.from(sig).toString('hex'),
    signerKeyId,
  };
}

/** Verify a single event's hash + (optional) signature against an
 *  expected previous hash. Returns true / false; does NOT throw on
 *  invalid signatures (so chain walking can continue and report all
 *  errors together). */
export async function verifyEvent(
  event: Event,
  publicKeyHex?: string,
): Promise<{ hashValid: boolean; signatureValid: boolean | null }> {
  const expectedHash = computeEventHash({
    payload: event.payload,
    prevHash: event.prevHash,
    timestamp: event.timestamp,
    actor: event.actor,
    disputeId: event.disputeId,
  });
  const hashValid = expectedHash === event.hash;

  let signatureValid: boolean | null = null;
  if (event.signature && publicKeyHex) {
    try {
      signatureValid = await ed.verifyAsync(
        Buffer.from(event.signature, 'hex'),
        Buffer.from(event.hash, 'hex'),
        Buffer.from(publicKeyHex, 'hex'),
      );
    } catch {
      signatureValid = false;
    }
  }

  return { hashValid, signatureValid };
}

/** Walk a chain of events for a single dispute. Returns aggregated
 *  verification result. The chain is considered VALID if every event's
 *  computed hash matches its stored hash AND every prevHash points to
 *  the immediately-preceding event's hash. */
export async function verifyChain(
  disputeId: string,
  events: Event[],
  publicKeyHex?: string,
): Promise<ChainVerificationResult> {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let signaturesChecked = 0;
  let signaturesValid = 0;
  let hashChainValid = true;
  const errors: string[] = [];

  let expectedPrevHash = '';
  for (const event of sorted) {
    if (event.disputeId !== disputeId) {
      errors.push(`event ${event.id} does not belong to dispute ${disputeId}`);
      hashChainValid = false;
      continue;
    }
    if (event.prevHash !== expectedPrevHash) {
      errors.push(`event ${event.id} prevHash mismatch (expected ${expectedPrevHash || '(empty)'}, got ${event.prevHash})`);
      hashChainValid = false;
    }
    const result = await verifyEvent(event, publicKeyHex);
    if (!result.hashValid) {
      errors.push(`event ${event.id} hash mismatch (chain tampered)`);
      hashChainValid = false;
    }
    if (result.signatureValid !== null) {
      signaturesChecked += 1;
      if (result.signatureValid) {
        signaturesValid += 1;
      } else {
        errors.push(`event ${event.id} signature invalid`);
      }
    }
    expectedPrevHash = event.hash;
  }

  return {
    disputeId,
    eventsChecked: sorted.length,
    hashChainValid,
    signaturesChecked,
    signaturesValid,
    errors,
  };
}
