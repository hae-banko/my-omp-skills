// OMP-IAP/v1 — Inter-Agent Communication Protocol.
//
// Standardized application-layer messaging, task handoff, and artifact exchange contract
// for autonomous subagents running inside oh-my-pi.
//
// Governed by:
// - ADR 0001: .omp/adr/0001-omp-iap-v1-inter-agent-protocol.md
// - CONTEXT.md ubiquitous language

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const IAP_PROTOCOL_VERSION = "omp-iap/v1" as const;
export const POINTER_THRESHOLD_BYTES = 2048; // Payloads >2 KB should be pointer envelopes

export type Performative =
  | "INFORM"
  | "QUERY"
  | "PROPOSE"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED";

export interface AgentSender {
  name: string;
  agent_type?: string;
}

export interface EnvelopeArtifact {
  uri: string; // "local://...", "results/01.json", or workspace path
  digest?: string; // "sha256:..."
  bytes?: number;
  mime_type?: string;
}

export interface EpistemicContext {
  confidence?: "high" | "medium" | "low" | "uncertain";
  sources_count?: number;
  parent_id?: string;
  in_reply_to?: string;
  attempts?: number;
}

export interface AgentEnvelope<T = unknown> {
  protocol: typeof IAP_PROTOCOL_VERSION;
  id: string;
  sender: AgentSender;
  recipient?: string;
  performative: Performative;
  payload: T;
  artifacts?: EnvelopeArtifact[];
  epistemic_context?: EpistemicContext;
  timestamp?: string;
  synthesized?: boolean;
}

export interface BuildEnvelopeOptions<T = unknown> {
  performative: Performative;
  sender: string | AgentSender;
  recipient?: string;
  payload: T;
  artifacts?: EnvelopeArtifact[];
  epistemic_context?: EpistemicContext;
  id?: string;
  timestamp?: string;
  synthesized?: boolean;
}

/**
 * Compute a deterministic SHA-256 epistemic digest formatted as `sha256:<hex>`.
 */
export function computeSha256(content: string | Buffer): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

/**
 * Compute an ID for an envelope based on timestamp and randomness.
 */
export function generateEnvelopeId(prefix = "iap"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * Construct a valid OMP-IAP/v1 envelope with sensible defaults.
 */
export function buildEnvelope<T = unknown>(options: BuildEnvelopeOptions<T>): AgentEnvelope<T> {
  const sender: AgentSender =
    typeof options.sender === "string"
      ? { name: options.sender, agent_type: "worker" }
      : options.sender;

  return {
    protocol: IAP_PROTOCOL_VERSION,
    id: options.id || generateEnvelopeId(),
    sender,
    recipient: options.recipient,
    performative: options.performative,
    payload: options.payload,
    artifacts: options.artifacts && options.artifacts.length > 0 ? options.artifacts : undefined,
    epistemic_context: options.epistemic_context,
    timestamp: options.timestamp || new Date().toISOString(),
    synthesized: options.synthesized,
  };
}

/**
 * Strict validator for OMP-IAP/v1 envelopes.
 */
export function validateEnvelope(obj: unknown): {
  valid: boolean;
  envelope?: AgentEnvelope;
  error?: string;
} {
  if (!obj || typeof obj !== "object") {
    return { valid: false, error: "Envelope must be a non-null object" };
  }

  const rec = obj as Record<string, unknown>;

  if (rec.protocol !== IAP_PROTOCOL_VERSION) {
    return {
      valid: false,
      error: `Invalid protocol identifier. Expected '${IAP_PROTOCOL_VERSION}', got '${String(rec.protocol)}'`,
    };
  }

  if (typeof rec.id !== "string" || !rec.id.trim()) {
    return { valid: false, error: "Envelope 'id' must be a non-empty string" };
  }

  if (!rec.sender || typeof rec.sender !== "object" || typeof (rec.sender as AgentSender).name !== "string") {
    return { valid: false, error: "Envelope 'sender' must be an object with a 'name' string" };
  }

  const validPerformatives = new Set<string>([
    "INFORM",
    "QUERY",
    "PROPOSE",
    "BLOCKED",
    "COMPLETED",
    "FAILED",
  ]);

  if (typeof rec.performative !== "string" || !validPerformatives.has(rec.performative)) {
    return {
      valid: false,
      error: `Invalid performative '${String(rec.performative)}'. Expected one of: ${Array.from(validPerformatives).join(", ")}`,
    };
  }

  if (rec.payload === undefined) {
    return { valid: false, error: "Envelope 'payload' must be defined (can be null or object)" };
  }

  if (rec.artifacts !== undefined) {
    if (!Array.isArray(rec.artifacts)) {
      return { valid: false, error: "Envelope 'artifacts', if defined, must be an array" };
    }
    for (let i = 0; i < rec.artifacts.length; i++) {
      const art = rec.artifacts[i];
      if (!art || typeof art !== "object" || typeof art.uri !== "string" || !art.uri.trim()) {
        return { valid: false, error: `Artifact at index ${i} must have a valid 'uri' string` };
      }
    }
  }

  return { valid: true, envelope: obj as AgentEnvelope };
}

/**
 * Check whether an envelope offloads its primary content to pointer artifacts.
 */
export function isPointerEnvelope(envelope: AgentEnvelope): boolean {
  return Boolean(envelope.artifacts && envelope.artifacts.length > 0);
}

/**
 * Parse an envelope from a raw JSON string or embedded Markdown fenced JSON block.
 */
export function parseEnvelope(raw: string): {
  parsed: boolean;
  envelope?: AgentEnvelope;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { parsed: false, error: "Empty input text" };
  }

  // 1. Attempt direct JSON parse
  try {
    const directObj = JSON.parse(raw.trim());
    const validation = validateEnvelope(directObj);
    if (validation.valid && validation.envelope) {
      return { parsed: true, envelope: validation.envelope };
    }
  } catch {
    // Fall back to scanning for fenced JSON block
  }

  // 2. Scan for ```json ... ``` or ```iap ... ``` block
  const blockMatch = raw.match(/```(?:json|iap|omp-iap)\s*\n([\s\S]*?)\n```/i);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      const validation = validateEnvelope(parsed);
      if (validation.valid && validation.envelope) {
        return { parsed: true, envelope: validation.envelope };
      }
      return { parsed: false, error: validation.error };
    } catch (err) {
      return { parsed: false, error: `Failed to parse fenced JSON block: ${String(err)}` };
    }
  }

  return { parsed: false, error: "No valid OMP-IAP envelope found in text" };
}

/**
 * Resolve an envelope's payload content, automatically dereferencing artifact URIs
 * if provided with a file reader.
 */
export async function resolveEnvelopePayload<T = unknown>(
  envelope: AgentEnvelope,
  fileReader?: (uri: string) => Promise<string> | string,
): Promise<{ payload: T; verified: boolean; error?: string }> {
  // If payload is already rich (not a stub) or no artifacts exist, return inline payload
  if (!isPointerEnvelope(envelope) || (typeof envelope.payload === "object" && envelope.payload !== null && Object.keys(envelope.payload).length > 1)) {
    return { payload: envelope.payload as T, verified: true };
  }

  if (!fileReader) {
    // Default synchronous local reader
    fileReader = (uri: string): string => {
      const cleanPath = uri.replace(/^local:\/\//, "").replace(/^file:\/\//, "");
      if (existsSync(cleanPath)) {
        return readFileSync(cleanPath, "utf8");
      }
      throw new Error(`Artifact URI "${uri}" not found on disk`);
    };
  }

  const primaryArtifact = envelope.artifacts?.[0];
  if (!primaryArtifact) {
    return { payload: envelope.payload as T, verified: true };
  }

  try {
    const content = await fileReader(primaryArtifact.uri);
    if (primaryArtifact.digest) {
      const actualDigest = computeSha256(content);
      if (actualDigest !== primaryArtifact.digest) {
        return {
          payload: envelope.payload as T,
          verified: false,
          error: `Digest mismatch for ${primaryArtifact.uri}. Expected ${primaryArtifact.digest}, got ${actualDigest}`,
        };
      }
    }

    try {
      const parsedJson = JSON.parse(content);
      return { payload: parsedJson as T, verified: true };
    } catch {
      return { payload: content as unknown as T, verified: true };
    }
  } catch (err) {
    return {
      payload: envelope.payload as T,
      verified: false,
      error: `Failed to read artifact: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
