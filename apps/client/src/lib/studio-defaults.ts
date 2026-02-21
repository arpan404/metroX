export const STUDIO_BASE_MODEL = 'gpt-4.1-mini'

export const STUDIO_ROLES = ['attacker', 'critic', 'verifier', 'analyst'] as const
export type StudioRole = (typeof STUDIO_ROLES)[number]

export type StudioNodeData = {
  label: string
  role: string
  model?: string
  description?: string
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
  }
}

export function createDefaultStudioMap() {
  const nodes = STUDIO_ROLES.map((role, index) => ({
    id: `studio-${role}`,
    type: 'studioRole',
    position: { x: 80 + index * 230, y: 220 },
    data: createStudioNodeData(role),
  }))

  const edges = STUDIO_ROLES.slice(0, -1).map((role, index) => ({
    id: `e-studio-${role}-${STUDIO_ROLES[index + 1]}`,
    source: `studio-${role}`,
    target: `studio-${STUDIO_ROLES[index + 1]}`,
  }))

  return { nodes, edges }
}
