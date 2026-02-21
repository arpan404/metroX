export const navItems = [
  { label: 'Overview', href: '#overview' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'API Surface', href: '#api-surface' },
]

export const heroStats = [
  { label: 'Evaluation Modes', value: 'LLM + Agentic' },
  { label: 'Execution Scale', value: '10k+ Deep Runs' },
  { label: 'Transport', value: 'SSE + WebSocket' },
]

export const productPillars = [
  {
    title: 'Benchmark Dataset',
    summary:
      'Versioned adversarial dataset with curated and generated attacks, slice tagging, novelty scoring, and reproducible lineage.',
    bullets: [
      'Prompt injection, jailbreak, hallucination, tool misuse, unsafe output coverage',
      'Multi-agent attacker orchestration with coordinator and join-policy controls',
      'Immutable run snapshots bound to config lineage',
    ],
  },
  {
    title: 'Scoring Framework',
    summary:
      'Deterministic and probabilistic scoring with rigorous statistical inference and confidence-aware release gating.',
    bullets: [
      'Detector labels + weak supervision fusion',
      'Bootstrap confidence intervals, effect sizes, corrected p-values',
      'Configurable hard caps and composite gate policies per run',
    ],
  },
  {
    title: 'Robustness Dashboard',
    summary:
      'Frontend-first command center for setup, telemetry, diagnostics, comparisons, and markdown reports.',
    bullets: [
      'Guided setup wizard with quick/standard/deep presets',
      'Live run telemetry, cost intelligence, and node-level performance views',
      'Drift, calibration, cooccurrence, forecast, and mitigation analytics',
    ],
  },
]

export const architectureLayers = [
  {
    name: 'Orchestration Runtime',
    detail:
      'AFK-native lifecycle, headless defaults, resumable checkpoints, and policy-decision audit events.',
  },
  {
    name: 'Data & Lineage',
    detail:
      'Run-centric persistence with immutable config snapshots and structured artifacts at every stage.',
  },
  {
    name: 'Reliability Analytics',
    detail:
      'Feature store, clustering, calibrated risk, drift diagnostics, and mitigation impact analysis.',
  },
  {
    name: 'Operational Controls',
    detail:
      'Trace IDs, SLO endpoint, queue stats, cost gates, and encrypted provider credential lifecycle.',
  },
]

export const apiSurface = [
  'Sessions + Config Profiles',
  'Run Orchestration + Resume',
  'Telemetry + Cost Timeseries',
  'Provider Credentials + Rotation Audits',
  'Orchestration Profiles + Validation',
  'Execution Slices + Inference APIs',
  'Cooccurrence + Forecast Intelligence',
  'Mitigation Experiments + Reports',
]

export const reliabilityPrinciples = [
  'Reproducibility first with fixed-seed deterministic modes',
  'Data lineage and auditability across every pipeline stage',
  'Policy and safety boundaries treated as release-blocking signals',
  'Frontend-first configuration without mandatory CLI edits',
]