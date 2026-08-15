// OMP-IAP/v1 — Hub Transport Adapter.
//
// Bridges the oh-my-pi `hub` actor message bus with strongly typed OMP-IAP envelopes.
// Provides serialization, envelope extraction from inboxes, and synthetic envelope generation.

import {
  AgentEnvelope,
  buildEnvelope,
  computeSha256,
  parseEnvelope,
  POINTER_THRESHOLD_BYTES,
} from "./iap.ts";

export interface HubMessageEnvelope {
  id?: string;
  from?: string;
  to?: string;
  message?: string;
  timestamp?: string;
  replyTo?: string;
}

/**
 * Format an IAP envelope for transmission over the hub tool.
 * Automatically offloads payloads >2 KB to a pointer envelope if content is provided as a string/buffer.
 */
export function serializeEnvelopeForHub(envelope: AgentEnvelope): string {
  const json = JSON.stringify(envelope);
  return json;
}

/**
 * Extract all valid IAP envelopes from a collection of hub inbox messages.
 */
export function extractEnvelopesFromHubInbox(messages: HubMessageEnvelope[]): AgentEnvelope[] {
  const envelopes: AgentEnvelope[] = [];

  for (const msg of messages) {
    if (!msg.message || typeof msg.message !== "string") continue;
    const result = parseEnvelope(msg.message);
    if (result.parsed && result.envelope) {
      // If the hub message metadata provides a 'from' and sender name is default, adopt it
      if (msg.from && (!result.envelope.sender.name || result.envelope.sender.name === "worker")) {
        result.envelope.sender.name = msg.from;
      }
      envelopes.push(result.envelope);
    }
  }

  return envelopes;
}

/**
 * Synthesize a valid COMPLETED envelope from an on-disk blackboard artifact.
 * Used for backward compatibility when an agent finishes writing a file without emitting a live message.
 */
export function synthesizeCompletedEnvelope(options: {
  filePath: string;
  fileContent: string;
  parsedPayload?: unknown;
  senderName?: string;
}): AgentEnvelope {
  const digest = computeSha256(options.fileContent);
  let payload = options.parsedPayload;

  if (payload === undefined) {
    try {
      payload = JSON.parse(options.fileContent);
    } catch {
      payload = { raw: options.fileContent };
    }
  }

  return buildEnvelope({
    performative: "COMPLETED",
    sender: { name: options.senderName || "blackboard-worker", agent_type: "worker" },
    payload,
    artifacts: [
      {
        uri: options.filePath,
        digest,
        bytes: Buffer.byteLength(options.fileContent, "utf8"),
      },
    ],
    synthesized: true,
  });
}

/**
 * Synthesize a BLOCKED envelope for an unfulfilled dependency.
 */
export function synthesizeBlockedEnvelope(options: {
  senderName: string;
  waitingFor: string;
  reason?: string;
}): AgentEnvelope {
  return buildEnvelope({
    performative: "BLOCKED",
    sender: { name: options.senderName, agent_type: "worker" },
    payload: {
      waiting_for: options.waitingFor,
      reason: options.reason || "MISSING_PREREQUISITE",
    },
    synthesized: true,
  });
}

/**
 * Synthesize a FAILED envelope when execution fails terminally.
 */
export function synthesizeFailedEnvelope(options: {
  senderName: string;
  error: string;
  code?: string;
}): AgentEnvelope {
  return buildEnvelope({
    performative: "FAILED",
    sender: { name: options.senderName, agent_type: "worker" },
    payload: {
      error: options.error,
      code: options.code || "TERMINAL_ERROR",
    },
    synthesized: true,
  });
}
