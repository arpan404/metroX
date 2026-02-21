export const STUDIO_BASE_MODEL = 'ollama_chat/gpt-oss:20b'

export const STUDIO_ROLES = ['attacker', 'critic', 'verifier', 'analyst', 'fraud_analyst'] as const
export type StudioRole = (typeof STUDIO_ROLES)[number]
export type StudioTemplateId = 'fraud_triage' | 'refund_guard' | 'deep_investigation'

export type StudioNodeData = {
  label: string
  role: string
  model?: string
  description?: string
  enabled?: boolean
  runtime_provider?: string
  api_key_ref?: string
  base_url?: string
  instruction_file?: string
  instructions?: string
  auth_headers?: Record<string, string>
  extra?: Record<string, unknown>
}

type StudioRoleDefault = {
  label: string
  description: string
  defaultModel?: string
}

export const STUDIO_ROLE_DEFAULTS: Record<StudioRole, StudioRoleDefault> = {
  attacker: {
    label: 'Attacker',
    description: 'Generate adversarial prompts and exploit variants.',
  },
  critic: {
    label: 'Critic',
    description: 'Review prompt quality and suggest improvements.',
  },
  verifier: {
    label: 'Verifier',
    description: 'Verify exploit plausibility with confidence.',
  },
  analyst: {
    label: 'Analyst',
    description: 'Score novelty, difficulty, and summarize outcomes.',
  },
  fraud_analyst: {
    label: 'Fraud Analyst',
    description: 'Assess fraud risk and recommend approve/review/block decisions.',
  },
}

export function resolveStudioRoleModel(role: string, providedModel?: string): string {
  const clean = (providedModel ?? '').trim()
  if (clean) return clean
  const fallback = STUDIO_ROLE_DEFAULTS[role as StudioRole]?.defaultModel
  return fallback || STUDIO_BASE_MODEL
}

export function createStudioNodeData(role: string, model?: string): StudioNodeData {
  const normalizedRole = role as StudioRole
  const preset = STUDIO_ROLE_DEFAULTS[normalizedRole]
  const label = preset?.label ?? `${role.charAt(0).toUpperCase()}${role.slice(1)}`
  const description = preset?.description ?? ''
  return {
    label: `${label} Node`,
    role,
    model: resolveStudioRoleModel(role, model),
    description,
    enabled: true,
    runtime_provider: 'litellm',
    api_key_ref: '',
    base_url: '',
    instruction_file: `${role}.md`,
    instructions: '',
    auth_headers: {},
    extra: {},
  }
}

export const STUDIO_GRAPH_TEMPLATES: Array<{
  id: StudioTemplateId
  name: string
  description: string
}> = [
  {
    id: 'fraud_triage',
    name: 'Fraud Triage',
    description: 'Balanced flow for pre-release fraud and safety checks.',
  },
  {
    id: 'refund_guard',
    name: 'Refund Guard',
    description: 'Focused flow for refund abuse and claim manipulation.',
  },
  {
    id: 'deep_investigation',
    name: 'Deep Investigation',
    description: 'High-scrutiny flow for complex exploit and identity risks.',
  },
]

function makeStudioNode(role: StudioRole, x: number, y: number) {
  return {
    id: `studio-${role}`,
    type: 'studioRole',
    position: { x, y },
    data: createStudioNodeData(role),
  }
}

function makeEdge(sourceRole: string, targetRole: string) {
  return {
    id: `e-studio-${sourceRole}-${targetRole}`,
    source: `studio-${sourceRole}`,
    target: `studio-${targetRole}`,
  }
}

export function createStudioMapFromTemplate(templateId: StudioTemplateId) {
  if (templateId === 'refund_guard') {
    const nodes = [
      makeStudioNode('attacker', 120, 360),
      makeStudioNode('verifier', 540, 140),
      makeStudioNode('fraud_analyst', 320, 120),
      makeStudioNode('analyst', 300, 300),
    ]
    const edges = [
      makeEdge('attacker', 'verifier'),
      makeEdge('attacker', 'fraud_analyst'),
      makeEdge('verifier', 'fraud_analyst'),
      makeEdge('fraud_analyst', 'analyst'),
    ]
    return { nodes, edges }
  }

  if (templateId === 'deep_investigation') {
    const nodes = [
      makeStudioNode('attacker', 80, 360),
      makeStudioNode('critic', 560, 560),
      makeStudioNode('verifier', 720, 180),
      makeStudioNode('fraud_analyst', 320, 120),
      makeStudioNode('analyst', 420, 300),
    ]
    const edges = [
      makeEdge('attacker', 'critic'),
      makeEdge('critic', 'verifier'),
      makeEdge('attacker', 'fraud_analyst'),
      makeEdge('verifier', 'fraud_analyst'),
      makeEdge('fraud_analyst', 'analyst'),
      makeEdge('critic', 'analyst'),
    ]
    return { nodes, edges }
  }

  const nodes = [
    makeStudioNode('attacker', 80, 360),
    makeStudioNode('critic', 560, 560),
    makeStudioNode('verifier', 720, 180),
    makeStudioNode('fraud_analyst', 320, 120),
    makeStudioNode('analyst', 420, 300),
  ]
  const edges = [
    makeEdge('attacker', 'critic'),
    makeEdge('critic', 'verifier'),
    makeEdge('verifier', 'fraud_analyst'),
    makeEdge('fraud_analyst', 'analyst'),
  ]
  return { nodes, edges }
}

export function createDefaultStudioMap() {
  return createStudioMapFromTemplate('fraud_triage')
}
