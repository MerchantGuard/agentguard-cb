/**
 * EventLogStore — pluggable persistence for the event chain.
 *
 * Self-host users can plug in a Postgres adapter (matching the existing
 * AgentGuard CB Drizzle setup) or any other backend by implementing
 * the EventLogStore interface. The in-memory adapter is the reference
 * implementation, also used in tests, and is sufficient for stateless
 * one-off MCP tool calls (which is the MCP server's only use case).
 *
 * The store is intentionally NARROW: append-only writes, list-and-get
 * reads, no updates, no deletes. The chain is the source of truth.
 */

import { randomUUID } from 'node:crypto';
import { computeEventHash, signHash } from './chain';
import type { Event, EventPayload } from './types';

export interface ListOpts {
  /** Skip events strictly before this ISO 8601 timestamp. */
  sinceTimestamp?: string;
  /** Limit results to this many events. */
  limit?: number;
}

export interface AppendInput {
  payload: EventPayload;
  actor: string;
  disputeId: string;
  /** Optional ISO timestamp; defaults to now. */
  timestamp?: string;
  /** Optional 64-char hex Ed25519 seed. If provided, the appended event
   *  is signed; the signer's hex public-key id is derived deterministically. */
  signingSeedHex?: string;
}

export interface EventLogStore {
  append(input: AppendInput): Promise<Event>;
  list(disputeId: string, opts?: ListOpts): Promise<Event[]>;
  get(eventId: string): Promise<Event | null>;
  /** All known dispute IDs in this store. Useful for dashboards. */
  listDisputes(): Promise<string[]>;
}

/**
 * In-memory EventLogStore. Stateless across process restarts. Suitable
 * for tests, MCP one-off tool calls, and CLI use. Production users
 * should plug in a persistent adapter (Postgres / sqlite / etc).
 */
export class InMemoryEventLogStore implements EventLogStore {
  private byDispute = new Map<string, Event[]>();
  private byId = new Map<string, Event>();

  async append(input: AppendInput): Promise<Event> {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const existing = this.byDispute.get(input.disputeId) ?? [];
    const prevHash = existing.length > 0 ? existing[existing.length - 1]!.hash : '';

    const hash = computeEventHash({
      payload: input.payload,
      prevHash,
      timestamp,
      actor: input.actor,
      disputeId: input.disputeId,
    });

    let signature: string | undefined;
    let signerKeyId: string | undefined;
    if (input.signingSeedHex) {
      const signed = await signHash(hash, input.signingSeedHex);
      signature = signed.signature;
      signerKeyId = signed.signerKeyId;
    }

    const event: Event = {
      id: randomUUID(),
      payload: input.payload,
      timestamp,
      actor: input.actor,
      disputeId: input.disputeId,
      prevHash,
      hash,
      signature,
      signerKeyId,
    };

    this.byDispute.set(input.disputeId, [...existing, event]);
    this.byId.set(event.id, event);
    return event;
  }

  async list(disputeId: string, opts?: ListOpts): Promise<Event[]> {
    let events = this.byDispute.get(disputeId) ?? [];
    if (opts?.sinceTimestamp) {
      events = events.filter(e => e.timestamp > opts.sinceTimestamp!);
    }
    if (opts?.limit !== undefined) {
      events = events.slice(0, opts.limit);
    }
    return events;
  }

  async get(eventId: string): Promise<Event | null> {
    return this.byId.get(eventId) ?? null;
  }

  async listDisputes(): Promise<string[]> {
    return Array.from(this.byDispute.keys());
  }
}
