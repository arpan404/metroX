import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

// ── Data ─────────────────────────────────────────────────────────────────────

const sections = [
    { id: 'architecture', label: 'System Architecture' },
    { id: 'lifecycle', label: 'Run Lifecycle' },
    { id: 'pipeline', label: 'Execution Pipeline' },
    { id: 'api', label: 'API Surface' },
    { id: 'datamodel', label: 'Data Model' },
    { id: 'grounding', label: 'Code Grounding' },
]

const systemNodes = [
    { name: 'Client UI', role: 'Frontend consumer' },
    { name: 'FastAPI App', role: 'HTTP + auth boundary' },
    { name: 'API Router /v1', role: 'Domain endpoints' },
    { name: 'Service Layer', role: 'Business logic' },
    { name: 'RunOrchestrator', role: 'Execution core' },
    { name: 'RunQueue', role: 'inprocess · redis' },
    { name: 'Target Adapters', role: 'LLM + Agent + HTTP' },
    { name: 'Postgres', role: 'Persisted state' },
]

const pipelineNodes = [
    { step: '01', label: 'Benchmark', sub: 'Curated + generated attacks', detail: 'Deduplication via stable hash, novelty scoring, slice tagging.' },
    { step: '02', label: 'Orchestrate', sub: 'Multi-agent attack generation', detail: 'Attacker · Critic · Verifier · Analyst roles with join-policy controls.' },
    { step: '03', label: 'Detect', sub: 'Rule + retrieval + judge', detail: 'Weighted vote fusion → failure flags, confidence, disagreement, uncertainty.' },
    { step: '04', label: 'Score', sub: 'Deterministic + probabilistic', detail: 'Bootstrap CIs · effect sizes · corrected p-values · gate policy evaluation.' },
    { step: '05', label: 'Analytics', sub: 'Feature → risk → drift', detail: 'UMAP/HDBSCAN clustering, calibrated risk models, PSI/KS drift signals, forecast.' },
    { step: '06', label: 'Gate', sub: 'Budget + quality', detail: 'Cost gate abort on breach · hard cap enforcement · composite score thresholds.' },
    { step: '07', label: 'Report', sub: 'Markdown artifact', detail: 'Scorecard + risk cards + drift + comparison + mitigation recommendations.' },
]

const apiGroups = [
    {
        group: 'Runtime',
        routes: [
            { method: 'POST', path: '/v1/runs', desc: 'Create run, bind config snapshot, enqueue' },
            { method: 'GET', path: '/v1/runs/{id}', desc: 'Run status and metadata' },
            { method: 'POST', path: '/v1/runs/{id}/resume', desc: 'Resume from checkpoint' },
            { method: 'GET', path: '/v1/runs/{id}/events', desc: 'SSE event stream' },
            { method: 'GET', path: '/v1/runs/{id}/ws', desc: 'WebSocket stream' },
            { method: 'GET', path: '/v1/queue/stats', desc: 'Queue depth, heartbeats, DLQ' },
        ],
    },
    {
        group: 'Analytics & DS',
        routes: [
            { method: 'GET', path: '/v1/runs/{id}/scorecard', desc: 'Composite + per-type scores' },
            { method: 'GET', path: '/v1/runs/{id}/risk-cards', desc: 'Calibrated risk predictions' },
            { method: 'GET', path: '/v1/runs/{id}/drift', desc: 'PSI/KS signals + change points' },
            { method: 'GET', path: '/v1/runs/{id}/inference', desc: 'Effect sizes + p-values' },
            { method: 'GET', path: '/v1/runs/{id}/calibration', desc: 'Reliability bins' },
            { method: 'GET', path: '/v1/runs/{id}/cooccurrence-graph', desc: 'Failure cooccurrence edges' },
            { method: 'GET', path: '/v1/runs/{id}/forecast', desc: 'Reliability + cost trends' },
            { method: 'GET', path: '/v1/runs/{id}/clusters', desc: 'UMAP/HDBSCAN summaries' },
            { method: 'GET', path: '/v1/runs/{id}/execution-slices', desc: 'Attack/provider/model slices' },
        ],
    },
    {
        group: 'Cost & Telemetry',
        routes: [
            { method: 'GET', path: '/v1/runs/{id}/cost-summary', desc: 'Total spend, provenance, gate state' },
            { method: 'GET', path: '/v1/runs/{id}/cost-timeseries', desc: 'Cost burn over time' },
            { method: 'GET', path: '/v1/runs/{id}/telemetry', desc: 'Live event + cost counters' },
            { method: 'GET', path: '/v1/runs/{id}/node-telemetry', desc: 'Per-attack latency + cost' },
        ],
    },
    {
        group: 'Providers & Credentials',
        routes: [
            { method: 'POST', path: '/v1/providers/validate', desc: 'Probe provider capability' },
            { method: 'POST', path: '/v1/providers/credentials', desc: 'Store encrypted API key' },
            { method: 'POST', path: '/v1/providers/credentials/{id}/rotate', desc: 'Key rotation' },
            { method: 'GET', path: '/v1/providers/credentials/{id}/audits', desc: 'Access audit trail' },
        ],
    },
    {
        group: 'Security Keys',
        routes: [
            { method: 'POST', path: '/v1/security/keys', desc: 'Create envelope cipher key' },
            { method: 'POST', path: '/v1/security/keys/{id}/activate', desc: 'Promote key to active' },
            { method: 'POST', path: '/v1/security/keys/{id}/reencrypt-credentials', desc: 'Re-wrap all ciphertexts' },
            { method: 'POST', path: '/v1/security/keys/{id}/retire', desc: 'Retire non-active key' },
            { method: 'GET', path: '/v1/security/keys/events', desc: 'Key lifecycle audit log' },
        ],
    },
    {
        group: 'Configuration',
        routes: [
            { method: 'POST', path: '/v1/orchestration-profiles', desc: 'Create profile (schema-validated)' },
            { method: 'PATCH', path: '/v1/orchestration-profiles/{id}', desc: 'Update profile' },
            { method: 'POST', path: '/v1/sessions', desc: 'Create session' },
            { method: 'POST', path: '/v1/config-profiles', desc: 'Create config profile' },
            { method: 'POST', path: '/v1/pricing-profiles', desc: 'Create pricing profile' },
        ],
    },
    {
        group: 'Compare & Report',
        routes: [
            { method: 'GET', path: '/v1/compare', desc: 'Baseline vs candidate + BH correction' },
            { method: 'POST', path: '/v1/mitigation-experiments', desc: 'Run mitigation experiment' },
            { method: 'POST', path: '/v1/reports/{run_id}/generate', desc: 'Generate markdown report' },
            { method: 'GET', path: '/v1/slo', desc: 'Error rate + latency SLO snapshot' },
        ],
    },
]

const dataEntities = [
    { name: 'EvaluationSession', rel: '1 → many ConfigProfiles' },
    { name: 'ConfigProfile', rel: '1 → many Runs, 1 → many ConfigSnapshots' },
    { name: 'Run', rel: 'Binds 1 ConfigSnapshot, generates BenchmarkSnapshot, Executions, Costs, Reports' },
    { name: 'BenchmarkSnapshot', rel: '1 → many AttackCases' },
    { name: 'Execution', rel: 'Has Detections, DetectionVotes, ProbabilisticLabels, ExecutionCost' },
    { name: 'Detection', rel: 'Fused failure flags + confidence + disagreement + uncertainty' },
    { name: 'FeatureValue', rel: 'Per-run, per-FeatureDefinition — feeds clusters + risk models' },
    { name: 'RiskModel / RiskPrediction', rel: 'Per-run calibrated predictions → CalibrationReport + StatisticalTest' },
    { name: 'DriftSignal / ChangePoint', rel: 'PSI/KS signals against baseline run' },
    { name: 'CooccurrenceEdge / ForecastReport', rel: 'Graph + time-series intelligence artifacts' },
    { name: 'ExecutionCost / RunCostAggregate', rel: 'Per-execution cost rows + run-level aggregate + gate state' },
    { name: 'ProviderCredential / SecretAccessAudit', rel: 'Encrypted ciphertext + access audit trail' },
    { name: 'SecretKey / SecretKeyEvent', rel: 'Envelope key lifecycle + full event log' },
    { name: 'Comparison / MitigationExperiment', rel: 'Cross-run comparison with BH correction + mitigation effects' },
]

const groundingMap = [
    { label: 'Orchestration', path: 'app/services/orchestrator.py' },
    { label: 'API + streaming', path: 'app/api/v1.py' },
    { label: 'Queue + worker', path: 'app/services/run_queue.py · app/worker.py' },
    { label: 'Adapters + policy', path: 'app/services/adapters.py · app/services/policy.py' },
    { label: 'Benchmark + agentic', path: 'app/services/benchmark.py · app/services/agentic_attacking.py' },
    { label: 'Detection', path: 'app/services/detection.py' },
    { label: 'Scoring', path: 'app/services/scoring.py' },
    { label: 'Risk + analytics', path: 'app/services/risk.py · app/services/advanced_analytics.py' },
    { label: 'Drift', path: 'app/services/drift.py' },
    { label: 'Costing', path: 'app/services/costing.py' },
    { label: 'Security', path: 'app/services/security.py' },
    { label: 'Providers', path: 'app/services/providers.py' },
    { label: 'Compare + Mitigation', path: 'app/services/compare.py · app/services/mitigation.py' },
    { label: 'Reporting', path: 'app/services/reporting.py' },
    { label: 'Entities + contracts', path: 'app/models.py · app/schemas.py' },
]

// ── Animations ───────────────────────────────────────────────────────────────

const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.055 } },
}

// ── Shared ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p
            className="font-mono tracking-[0.2em] uppercase mb-7"
            style={{ fontSize: '12px', color: 'var(--text-muted)', opacity: 0.65 }}
        >
            {children}
        </p>
    )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div
            style={{
                background: 'rgba(255,255,255,0.022)',
                border: '1px solid rgba(171,187,214,0.12)',
                borderRadius: '12px',
                ...style,
            }}
        >
            {children}
        </div>
    )
}

// ── Component ────────────────────────────────────────────────────────────────

export function DocsPage() {
    return (
        <div
            className="relative min-h-screen"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
            <div className="noise-overlay" />

            {/* ── Top bar ──────────────────────────────── */}
            <motion.header
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="sticky top-0 z-50 px-8 sm:px-12 py-5 flex items-center justify-between"
                style={{
                    background: 'rgba(7,10,18,0.90)',
                    backdropFilter: 'blur(18px)',
                    borderBottom: '1px solid rgba(171,187,214,0.09)',
                }}
            >
                <div className="flex items-center gap-5">
                    <Link to="/" className="flex items-center opacity-65 hover:opacity-95 transition-opacity duration-200">
                        <img src="/favicon.svg" alt="MetroX" style={{ height: '24px', width: '24px', objectFit: 'contain' }} />
                    </Link>
                    <span style={{ width: '1px', height: '18px', background: 'rgba(171,187,214,0.15)' }} />
                    <span
                        className="font-mono tracking-[0.15em] uppercase"
                        style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.72 }}
                    >
                        Architecture Docs
                    </span>
                </div>

                <nav className="hidden sm:flex items-center gap-6">
                    {sections.map(s => (
                        <a
                            key={s.id}
                            href={`#${s.id}`}
                            className="font-mono tracking-[0.12em] uppercase transition-all duration-200"
                            style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.62 }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.62')}
                        >
                            {s.label}
                        </a>
                    ))}
                </nav>
            </motion.header>

            {/* ── Body ──────────────────────────────────── */}
            <main className="max-w-5xl mx-auto px-6 sm:px-10 py-20 space-y-28">

                {/* System Architecture ─────────────────── */}
                <motion.section
                    id="architecture"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <SectionLabel>System Architecture</SectionLabel>
                    <Card style={{ padding: '28px 0', overflow: 'hidden' }}>
                        <div className="grid grid-cols-2 sm:grid-cols-4">
                            {systemNodes.map((n, i) => (
                                <motion.div
                                    key={n.name}
                                    variants={fadeUp}
                                    className="flex flex-col gap-1.5 px-5 py-5"
                                    style={{
                                        borderRight: i % 4 < 3 ? '1px solid rgba(171,187,214,0.09)' : 'none',
                                        borderBottom: i < 4 ? '1px solid rgba(171,187,214,0.09)' : 'none',
                                    }}
                                >
                                    <span className="font-display font-semibold" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                        {n.name}
                                    </span>
                                    <span className="font-mono tracking-[0.06em]" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.65 }}>
                                        {n.role}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                        <div
                            className="px-6 py-4 flex flex-wrap gap-x-8 gap-y-2"
                            style={{ borderTop: '1px solid rgba(171,187,214,0.09)' }}
                        >
                            {[
                                ['Backend', 'FastAPI + SQLAlchemy + Postgres'],
                                ['Frontend', 'Vite + React + TypeScript'],
                                ['Queue', 'inprocess · redis worker'],
                                ['Auth', 'X-API-Key'],
                                ['Observability', 'Trace ID + JSON logs + /slo'],
                            ].map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                    <span className="font-mono tracking-[0.12em] uppercase" style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.52 }}>{k}</span>
                                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.75 }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </motion.section>

                {/* Run Lifecycle ───────────────────────── */}
                <motion.section
                    id="lifecycle"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <SectionLabel>Run Lifecycle</SectionLabel>
                    <div className="space-y-2">
                        {[
                            { seq: '1', actor: 'Client → API', event: 'POST /v1/runs — insert Run(queued) + ConfigSnapshot' },
                            { seq: '2', actor: 'API → Queue', event: 'Enqueue run_id via inprocess thread or redis' },
                            { seq: '3', actor: 'Worker → Orchestrator', event: 'execute_run(run_id) — mark running + persist run state checkpoint' },
                            { seq: '4', actor: 'Orchestrator → Adapters', event: 'Per attack: invoke target, insert Execution, Detection, ProbabilisticLabel, ExecutionCost' },
                            { seq: '5', actor: 'Orchestrator', event: 'Budget gate check — abort + checkpoint if breach and abort_on_cost_breach=true' },
                            { seq: '6', actor: 'Orchestrator', event: 'Rebuild features, clusters, risk, analytics, scorecard, drift' },
                            { seq: '7', actor: 'Orchestrator → DB', event: 'Mark completed + log run_completed event' },
                            { seq: '8', actor: 'Client → SSE/WS', event: 'Stream RunEvent rows until terminal status — resume via POST /v1/runs/{id}/resume' },
                        ].map((row) => (
                            <motion.div
                                key={row.seq}
                                variants={fadeUp}
                                className="flex items-start gap-5 px-5 py-4 rounded-xl"
                                style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid rgba(171,187,214,0.09)' }}
                            >
                                <span
                                    className="font-mono shrink-0 mt-0.5"
                                    style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.48, minWidth: '14px' }}
                                >
                                    {row.seq}
                                </span>
                                <span
                                    className="font-mono shrink-0"
                                    style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.82, minWidth: '160px' }}
                                >
                                    {row.actor}
                                </span>
                                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)', opacity: 0.70 }}>
                                    {row.event}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Execution Pipeline ──────────────────── */}
                <motion.section
                    id="pipeline"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <SectionLabel>Execution Pipeline</SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px" style={{ border: '1px solid rgba(171,187,214,0.12)', borderRadius: '12px', overflow: 'hidden' }}>
                        {pipelineNodes.map((n) => (
                            <motion.div
                                key={n.step}
                                variants={fadeUp}
                                className="flex gap-4 p-5"
                                style={{ background: 'rgba(255,255,255,0.022)', transition: 'background 220ms ease' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.038)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.022)')}
                            >
                                <span className="font-mono mt-0.5 shrink-0" style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.42 }}>{n.step}</span>
                                <div className="flex flex-col gap-1.5">
                                    <span className="font-display font-semibold" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{n.label}</span>
                                    <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.75 }}>{n.sub}</span>
                                    <span className="font-mono mt-0.5" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.55, lineHeight: 1.6 }}>{n.detail}</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* API Surface ─────────────────────────── */}
                <motion.section
                    id="api"
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                    variants={stagger}
                >
                    <SectionLabel>API Surface</SectionLabel>
                    <div className="space-y-6">
                        {apiGroups.map((group) => (
                            <div key={group.group}>
                                <p
                                    className="font-mono tracking-[0.16em] uppercase mb-3"
                                    style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.58 }}
                                >
                                    {group.group}
                                </p>
                                <Card>
                                    {group.routes.map((r, i) => (
                                        <motion.div
                                            key={r.path}
                                            variants={fadeUp}
                                            className="flex items-center gap-4 px-5 py-3"
                                            style={{
                                                borderBottom: i < group.routes.length - 1 ? '1px solid rgba(171,187,214,0.08)' : 'none',
                                            }}
                                        >
                                            <span
                                                className="font-mono uppercase tracking-[0.1em] shrink-0"
                                                style={{
                                                    fontSize: '10px',
                                                    color: r.method === 'GET'
                                                        ? 'rgba(120,190,150,0.82)'
                                                        : r.method === 'POST'
                                                            ? 'rgba(130,170,230,0.82)'
                                                            : 'rgba(210,180,110,0.82)',
                                                    minWidth: '40px',
                                                }}
                                            >
                                                {r.method}
                                            </span>
                                            <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)', opacity: 0.82, minWidth: '280px' }}>
                                                {r.path}
                                            </span>
                                            <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.62 }}>
                                                {r.desc}
                                            </span>
                                        </motion.div>
                                    ))}
                                </Card>
                            </div>
                        ))}
                    </div>
                </motion.section>

                {/* Data Model ──────────────────────────── */}
                <motion.section
                    id="datamodel"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <SectionLabel>Data Model</SectionLabel>
                    <Card>
                        {dataEntities.map((e, i) => (
                            <motion.div
                                key={e.name}
                                variants={fadeUp}
                                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 px-5 py-3.5"
                                style={{ borderBottom: i < dataEntities.length - 1 ? '1px solid rgba(171,187,214,0.08)' : 'none' }}
                            >
                                <span
                                    className="font-mono shrink-0"
                                    style={{ fontSize: '13px', color: 'var(--text-primary)', opacity: 0.88, minWidth: '220px' }}
                                >
                                    {e.name}
                                </span>
                                <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', opacity: 0.62 }}>
                                    {e.rel}
                                </span>
                            </motion.div>
                        ))}
                    </Card>
                </motion.section>

                {/* Code Grounding ──────────────────────── */}
                <motion.section
                    id="grounding"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-80px' }}
                >
                    <SectionLabel>Code Grounding</SectionLabel>
                    <Card>
                        <div className="grid grid-cols-1 sm:grid-cols-2">
                            {groundingMap.map((g, i) => (
                                <motion.div
                                    key={g.label}
                                    variants={fadeUp}
                                    className="flex flex-col gap-1.5 px-5 py-4"
                                    style={{
                                        borderRight: i % 2 === 0 ? '1px solid rgba(171,187,214,0.08)' : 'none',
                                        borderBottom: i < groundingMap.length - 2 ? '1px solid rgba(171,187,214,0.08)' : 'none',
                                    }}
                                >
                                    <span className="font-display font-medium" style={{ fontSize: '13px', color: 'var(--text-primary)', opacity: 0.88 }}>
                                        {g.label}
                                    </span>
                                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.62, lineHeight: 1.55 }}>
                                        {g.path}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </Card>
                </motion.section>

            </main>

            {/* ── Footer ───────────────────────────────── */}
            <footer
                className="px-8 sm:px-12 py-7 flex items-center justify-between"
                style={{ borderTop: '1px solid rgba(171,187,214,0.08)' }}
            >
                <p className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)', opacity: 0.48 }}>
                    © {new Date().getFullYear()} MetroX · V1.11
                </p>
                <Link
                    to="/"
                    className="font-mono tracking-[0.15em] uppercase transition-all duration-200"
                    style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.55 }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.90')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.55')}
                >
                    ← Back to Home
                </Link>
            </footer>
        </div>
    )
}
