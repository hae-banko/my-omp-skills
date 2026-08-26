// Council domain barrel — public API for the multi-perspective deliberation
// engine (SPEC-002), Star Chamber consensus partitioner, Ed25519 signer
// (ADR-034), interactive verdict overlay, and decision-record lister.
//
// Consumers should import from `./council/index.ts` (or this file's siblings)
// rather than reaching into individual modules so refactors stay localized.

export {
  COUNCIL_CUSTOM_TYPE,
  COUNCIL_STATUS_KEY,
  COUNCIL_PRESET_ALIASES,
  COUNCIL_PRESET_IDS,
  COUNCIL_PRESETS,
  DEFAULT_COUNCIL_CONFIG,
  DEFAULT_COUNCIL_TRIAD,
  ELECTRICAL_EE_TRIAD,
  EMBEDDED_TRIAD,
  ML_RESEARCH_TRIAD,
  installCouncilVerdictRenderer,
  listCouncilPresets,
  listCouncils,
  loadCouncilConfig,
  parseCouncilSubcommand,
  partitionCouncilOpinions,
  renderCouncilVerdictCard,
  runCouncilCommand,
  runCouncilEditSubcommand,
  scaffoldCouncilYaml,
  signCouncilVerdict,
  summarizeVerdict,
  verifyCouncilSignature,
  type CouncilConfig,
  type CouncilMode,
  type CouncilOpinion,
  type CouncilPersona,
  type CouncilVerdict,
  type ParsedCouncilArgs,
  type PartitionResult,
} from "./council.ts";

export {
  createCouncilOverlay,
  type CouncilOverlayAction,
  type CouncilOverlayComponent,
  type CouncilOverlayDone,
  type CouncilOverlayState,
  type CouncilOverlayTab,
} from "./council-overlay.ts";

export {
  DEFAULT_RECENT_LIMIT,
  MAX_RECENT_LIMIT,
  isRecentArgs,
  listDebateRecords,
  parseDebateFrontmatter,
  parseRecentCount,
  renderCouncilHistoryCard,
  runCouncilRecentCommand,
  type DebateFrontmatter,
  type DebateRecord,
} from "./council-history.ts";
