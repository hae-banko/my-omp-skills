// Inter-Agent Protocol (OMP-IAP/v1) & Subagent File Contract Test Suite

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEnvelope,
  computeSha256,
  isPointerEnvelope,
  parseEnvelope,
  resolveEnvelopePayload,
  validateEnvelope,
} from "../src/protocol/iap.ts";
import {
  extractEnvelopesFromHubInbox,
  serializeEnvelopeForHub,
  synthesizeBlockedEnvelope,
  synthesizeCompletedEnvelope,
  synthesizeFailedEnvelope,
} from "../src/protocol/iap-hub.ts";
import {
  buildResearchDag,
  ingestIapEnvelope,
  synthesizeEnvelopesForDag,
} from "../src/research/research-dag.ts";
import {
  generateSubagentFileContract,
  parseFileContract,
} from "../src/features/subagent-contract.ts";
import {
  createTempFixture,
  fail,
  type TestContext,
} from "./test-utils.ts";

export async function runProtocolSuite(ctx: TestContext): Promise<void> {
  // 1. Envelope Construction & Hashing
  const hashTest = computeSha256("test artifact payload content");
  if (!hashTest.startsWith("sha256:") || hashTest.length !== 71) {
    fail(`computeSha256: invalid hash format: ${hashTest}`);
  }

  const envelope = buildEnvelope({
    performative: "INFORM",
    sender: "crypto-analyst",
    recipient: "Main",
    payload: { verified_spec: "https://example.com/spec.pdf" },
  });
  if (envelope.protocol !== "omp-iap/v1" || envelope.performative !== "INFORM") {
    fail(`buildEnvelope: invalid envelope structure: ${JSON.stringify(envelope)}`);
  }

  // 2. Markdown Block Envelope Parsing
  const rawTextWithEnvelope = `
I have finished analyzing the official specification.

\`\`\`iap
${JSON.stringify(envelope, null, 2)}
\`\`\`
  `;
  const parsedRes = parseEnvelope(rawTextWithEnvelope);
  if (!parsedRes.parsed || !parsedRes.envelope || parsedRes.envelope.sender.name !== "crypto-analyst") {
    fail(`parseEnvelope: failed to extract envelope from markdown block: ${JSON.stringify(parsedRes)}`);
  }

  // 3. Hub Message Bus Extraction
  const hubMessages = [
    { from: "agent_1", message: "Regular text message" },
    { from: "agent_2", message: serializeEnvelopeForHub(envelope) },
  ];
  const extracted = extractEnvelopesFromHubInbox(hubMessages);
  if (extracted.length !== 1 || extracted[0].performative !== "INFORM") {
    fail(`extractEnvelopesFromHubInbox: expected 1 extracted envelope, got: ${extracted.length}`);
  }

  // 4. Reactive DAG Ingestion & Live Coordination
  const items = [
    { id: "node_a", name: "Node A" },
    { id: "node_b", name: "Node B", depends_on: ["node_a"] },
    { id: "node_c", name: "Node C", depends_on: ["node_b"] },
  ];
  const dag = buildResearchDag(items);

  // Ingest BLOCKED envelope on node_a
  const blockedEnv = buildEnvelope({
    performative: "BLOCKED",
    sender: "node_a",
    payload: { node_id: "node_a", reason: "rate_limit", waiting_for: "cooldown" },
  });
  const blockRes = ingestIapEnvelope(dag, blockedEnv);
  if (!blockRes.updated || !blockRes.suspendedNodes.includes("node_a")) {
    fail("ingestIapEnvelope: expected node_a to be suspended");
  }

  // Ingest COMPLETED envelope on node_a -> unblocks node_b
  const compEnv = buildEnvelope({
    performative: "COMPLETED",
    sender: "node_a",
    payload: { node_id: "node_a", file: "results/node_a.json" },
  });
  const compRes = ingestIapEnvelope(dag, compEnv);
  if (!compRes.updated || !compRes.unblockedNodes.includes("node_b")) {
    fail("ingestIapEnvelope: expected node_b to be unblocked");
  }
  if (dag.nodes.get("node_b")?.status !== "ready") {
    fail("ingestIapEnvelope: node_b status should be ready");
  }

  // 5. Subagent File Contract
  const fixture = createTempFixture("file-contract-test-");
  const contract = generateSubagentFileContract({
    itemId: "cipher_audit",
    itemName: "Audit Cipher",
    itemIndex: 1,
    projectDir: fixture.dir,
    fieldsPath: join(fixture.dir, "fields.yaml"),
  });

  if (!contract.contractPrompt.includes("<file-contract>") || !contract.contractPrompt.includes("results/02_cipher_audit.json")) {
    fail(`generateSubagentFileContract: missing expected contract format: ${contract.contractPrompt}`);
  }

  const parsedContract = parseFileContract(contract.contractPrompt);
  if (!parsedContract || parsedContract.itemId !== "cipher_audit" || parsedContract.targetPath !== "results/02_cipher_audit.json") {
    fail(`parseFileContract: unexpected parsed contract: ${JSON.stringify(parsedContract)}`);
  }

  // 6. Synthetic Envelopes from On-Disk Results
  const resDir = join(fixture.dir, "results");
  mkdirSync(resDir, { recursive: true });
  writeFileSync(join(resDir, "node_a.json"), JSON.stringify({ item: "node_a", result: "ok" }), "utf8");

  const synthEnvelopes = synthesizeEnvelopesForDag(dag, resDir);
  if (synthEnvelopes.length < 1) {
    fail(`synthesizeEnvelopesForDag: expected at least 1 synthetic envelope, got ${synthEnvelopes.length}`);
  }

  fixture.cleanup();
}
