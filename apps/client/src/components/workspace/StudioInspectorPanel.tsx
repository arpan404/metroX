import { useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  CircleAlert,
  FileCode2,
  KeyRound,
  Link2,
  RefreshCcw,
  Save,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PanelShell, PanelSection, FieldGroup, EmptyState } from './PanelShell'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const PROVIDER_OPTIONS = [
  'litellm',
  'openai',
  'anthropic',
  'google',
  'azure',
  'mistral',
  'deepseek',
  'together',
  'groq',
]

const ROLE_ACCENTS: Record<string, string> = {
  attacker: 'border-red-500/40 text-red-300',
  critic: 'border-amber-500/40 text-amber-300',
  verifier: 'border-sky-500/40 text-sky-300',
  analyst: 'border-emerald-500/40 text-emerald-300',
  fraud_analyst: 'border-fuchsia-500/40 text-fuchsia-300',
}

type StudioNodeData = {
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

type StudioNode = {
  id: string
  data: StudioNodeData
}

type NodeDraft = {
  label: string
  role: string
  description: string
  enabled: boolean
  model: string
  runtime_provider: string
  api_key_ref: string
  base_url: string
  instruction_file: string
  instructions: string
  auth_headers_json: string
  extra_json: string
}

type ValidationResult = {
  errors: Partial<Record<keyof NodeDraft, string>>
  authHeaders: Record<string, string>
  extra: Record<string, unknown>
}

function toPrettyObjectJSON(value: unknown): string {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}'
    return JSON.stringify(value, null, 2)
  } catch {
    return '{}'
  }
}

function buildDraftFromNode(node: StudioNode): NodeDraft {
  return {
    label: String(node.data.label ?? ''),
    role: String(node.data.role ?? ''),
    description: String(node.data.description ?? ''),
    enabled: node.data.enabled !== false,
    model: String(node.data.model ?? ''),
    runtime_provider: String(node.data.runtime_provider ?? 'litellm') || 'litellm',
    api_key_ref: String(node.data.api_key_ref ?? ''),
    base_url: String(node.data.base_url ?? ''),
    instruction_file: String(node.data.instruction_file ?? ''),
    instructions: String(node.data.instructions ?? ''),
    auth_headers_json: toPrettyObjectJSON(node.data.auth_headers ?? {}),
    extra_json: toPrettyObjectJSON(node.data.extra ?? {}),
  }
}

function parseObjectJSON(raw: string): { value: Record<string, unknown>; error: string | null } {
  const input = raw.trim() || '{}'
  try {
    const parsed = JSON.parse(input)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: {}, error: 'must be a JSON object' }
    }
    return { value: parsed as Record<string, unknown>, error: null }
  } catch {
    return { value: {}, error: 'contains invalid JSON' }
  }
}

function normalizeObjectJSON(raw: string): string {
  const parsed = parseObjectJSON(raw)
  if (parsed.error) return raw.trim()
  return JSON.stringify(parsed.value)
}

function draftsEqual(a: NodeDraft, b: NodeDraft): boolean {
  return JSON.stringify({
    ...a,
    auth_headers_json: normalizeObjectJSON(a.auth_headers_json),
    extra_json: normalizeObjectJSON(a.extra_json),
  }) === JSON.stringify({
    ...b,
    auth_headers_json: normalizeObjectJSON(b.auth_headers_json),
    extra_json: normalizeObjectJSON(b.extra_json),
  })
}

function roleBadgeClass(role: string): string {
  return ROLE_ACCENTS[role] ?? 'border-primary/35 text-primary'
}

export function StudioInspectorPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.activePanel === 'studio-inspector'

  const studioNodes = useMemo(
    () => state.studioNodes.filter((node) => node.type === 'studioRole') as StudioNode[],
    [state.studioNodes],
  )

  const selectedNode = useMemo<StudioNode | null>(() => {
    const selected = studioNodes.find((node) => node.id === state.selectedNodeId)
    return selected ?? studioNodes[0] ?? null
  }, [studioNodes, state.selectedNodeId])

  const [credentialOptions, setCredentialOptions] = useState<Array<{ id: string; name: string; provider_type: string }>>([])
  const [draft, setDraft] = useState<NodeDraft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof NodeDraft, string>>>({})

  useEffect(() => {
    if (!isOpen) return
    api
      .listProviderCredentials()
      .then((res) => setCredentialOptions((res.credentials ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        provider_type: row.provider_type,
      }))))
      .catch(() => {
        setCredentialOptions([])
      })
  }, [isOpen])

  useEffect(() => {
    if (!selectedNode) {
      setDraft(null)
      setErrors({})
      return
    }
    setDraft(buildDraftFromNode(selectedNode))
    setErrors({})
  }, [selectedNode?.id])

  useEffect(() => {
    if (!isOpen || !selectedNode) return
    if (state.selectedNodeId !== selectedNode.id) {
      dispatch({ type: 'SELECT_NODE', nodeId: selectedNode.id, attackType: null })
    }
  }, [isOpen, selectedNode?.id, state.selectedNodeId, dispatch])

  const cleanDraft = useMemo(() => (selectedNode ? buildDraftFromNode(selectedNode) : null), [selectedNode])
  const hasUnsavedChanges = Boolean(draft && cleanDraft && !draftsEqual(draft, cleanDraft))

  const updateDraft = (partial: Partial<NodeDraft>) => {
    setDraft((current) => {
      if (!current) return current
      return { ...current, ...partial }
    })
  }

  const validateDraft = (candidate: NodeDraft): ValidationResult => {
    const nextErrors: Partial<Record<keyof NodeDraft, string>> = {}
    if (candidate.enabled && !candidate.model.trim()) {
      nextErrors.model = 'Model is required for enabled nodes.'
    }
    if (candidate.base_url.trim() && !/^https?:\/\/.+/i.test(candidate.base_url.trim())) {
      nextErrors.base_url = 'Base URL must start with http:// or https://'
    }

    const auth = parseObjectJSON(candidate.auth_headers_json)
    if (auth.error) nextErrors.auth_headers_json = `Auth headers ${auth.error}.`

    const extra = parseObjectJSON(candidate.extra_json)
    if (extra.error) nextErrors.extra_json = `Extra payload ${extra.error}.`

    return {
      errors: nextErrors,
      authHeaders: auth.value as Record<string, string>,
      extra: extra.value,
    }
  }

  const persistDraft = (options?: { quiet?: boolean; openRunSetup?: boolean }): boolean => {
    if (!selectedNode || !draft) return false
    const result = validateDraft(draft)
    setErrors(result.errors)
    if (Object.keys(result.errors).length > 0) {
      if (!options?.quiet) toast.error('Fix the highlighted runtime fields before saving.')
      return false
    }

    dispatch({
      type: 'UPDATE_STUDIO_NODE',
      nodeId: selectedNode.id,
      data: {
        label: draft.label.trim() || `${draft.role} node`,
        role: draft.role.trim() || selectedNode.data.role,
        description: draft.description.trim(),
        enabled: draft.enabled,
        model: draft.model.trim(),
        runtime_provider: draft.runtime_provider.trim() || 'litellm',
        api_key_ref: draft.api_key_ref.trim(),
        base_url: draft.base_url.trim(),
        instruction_file: draft.instruction_file.trim(),
        instructions: draft.instructions.trim(),
        auth_headers: result.authHeaders,
        extra: result.extra,
      },
    })
    if (!options?.quiet) toast.success(`Saved runtime settings for ${draft.role}.`)
    if (options?.openRunSetup) dispatch({ type: 'OPEN_PANEL', panel: 'config' })
    return true
  }

  const resetDraft = () => {
    if (!selectedNode) return
    setDraft(buildDraftFromNode(selectedNode))
    setErrors({})
  }

  const selectNode = (nodeId: string) => {
    if (!selectedNode || !draft || selectedNode.id === nodeId) {
      dispatch({ type: 'SELECT_NODE', nodeId, attackType: null })
      return
    }
    if (hasUnsavedChanges) {
      const saved = persistDraft({ quiet: true })
      if (!saved) {
        toast.error('Current node has invalid values. Fix and save before switching.')
        return
      }
    }
    dispatch({ type: 'SELECT_NODE', nodeId, attackType: null })
  }

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="right"
      title="Node Runtime Studio"
      icon={<Workflow className="h-4 w-4" />}
      subtitle="Configure model, provider credentials, and endpoint overrides per orchestration node"
      width="w-[430px] lg:w-[500px]"
      footer={
        selectedNode && draft ? (
          <div className="flex flex-col gap-2">
            <div className="min-w-0 text-[10px] leading-snug text-muted-foreground">
              Saved values are written into <code>benchmark_config.afk_orchestration.roles</code>.
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-[10px]"
                onClick={resetDraft}
                disabled={!hasUnsavedChanges}
              >
                <RefreshCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-[10px]"
                onClick={() => persistDraft({ openRunSetup: true })}
                disabled={!hasUnsavedChanges}
              >
                <Save className="mr-1 h-3 w-3" />
                Save + Setup
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 shrink-0 text-[10px]"
                onClick={() => persistDraft()}
                disabled={!hasUnsavedChanges}
              >
                <Save className="mr-1 h-3 w-3" />
                Save Node
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {state.canvasMode !== 'studio' ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="Switch to Studio mode"
          description="Use Studio mode from the bottom bar, then select any node to edit runtime behavior."
        />
      ) : !selectedNode || !draft ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No studio node available"
          description="Add a role node on the canvas to configure LLM model, provider, and endpoint settings."
        />
      ) : (
        <div className="space-y-0">
          <PanelSection
            title="Node Directory"
            description="Select a node; changes are validated and saved per node"
            badge={
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="h-4 text-[10px]">{studioNodes.length}</Badge>
                {hasUnsavedChanges ? (
                  <Badge variant="secondary" className="h-4 text-[10px] bg-amber-500/20 text-amber-300">
                    unsaved
                  </Badge>
                ) : null}
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {studioNodes.map((node) => {
                const active = node.id === selectedNode.id
                const accent = roleBadgeClass(node.data.role)
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => selectNode(node.id)}
                    className={cn(
                      'min-w-0 rounded-lg border px-2 py-1.5 text-left transition-colors',
                      active
                        ? cn('bg-primary/15 border-primary/55', accent)
                        : cn('bg-background/55 border-border/45 hover:border-primary/35', accent),
                    )}
                  >
                    <p className="truncate text-[11px] font-semibold">{node.data.role}</p>
                    <p className="truncate text-[10px] text-muted-foreground font-mono">{node.data.model || 'model unset'}</p>
                  </button>
                )
              })}
            </div>
          </PanelSection>

          <PanelSection title="Runtime Connection" description="Exact LLM runtime controls for this node">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FieldGroup label="Enabled" horizontal>
                <Switch checked={draft.enabled} onCheckedChange={(value) => updateDraft({ enabled: value })} />
              </FieldGroup>
              <FieldGroup label="Role">
                <Input value={draft.role} readOnly className="h-7 text-xs font-mono bg-muted/30" />
              </FieldGroup>
            </div>

            <FieldGroup label="Node Label">
              <Input
                value={draft.label}
                onChange={(event) => updateDraft({ label: event.target.value })}
                className="h-7 text-xs"
              />
            </FieldGroup>

            <FieldGroup label="Node Description">
              <Textarea
                value={draft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
                rows={2}
                className="text-xs"
              />
            </FieldGroup>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FieldGroup label="Model" hint="Runtime model for this node">
                <Input
                  value={draft.model}
                  onChange={(event) => updateDraft({ model: event.target.value })}
                  placeholder="ollama_chat/gpt-oss:20b"
                  className={cn('h-7 text-xs font-mono', errors.model && 'border-destructive')}
                />
                {errors.model ? <p className="text-[10px] text-destructive">{errors.model}</p> : null}
              </FieldGroup>

              <FieldGroup label="Provider" hint="Runtime provider for this node">
                <Select value={draft.runtime_provider || 'litellm'} onValueChange={(value) => updateDraft({ runtime_provider: value })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((provider) => (
                      <SelectItem key={provider} value={provider} className="text-xs">
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>

            <FieldGroup label="API Key Ref" hint="Credential ID from Provider Credentials">
              <div className="space-y-1.5">
                {credentialOptions.length > 0 ? (
                  <Select
                    value={draft.api_key_ref || '__none__'}
                    onValueChange={(value) => updateDraft({ api_key_ref: value === '__none__' ? '' : value })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select saved credential" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">No credential</SelectItem>
                      {credentialOptions.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id} className="text-xs">
                          {credential.name} ({credential.provider_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <div className="relative">
                  <KeyRound className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={draft.api_key_ref}
                    onChange={(event) => updateDraft({ api_key_ref: event.target.value })}
                    placeholder="credential-id..."
                    className="h-7 pl-7 text-xs font-mono"
                  />
                </div>
              </div>
            </FieldGroup>

            <FieldGroup label="API Endpoint (Base URL)" hint="Optional provider endpoint override for this node">
              <div className="relative">
                <Link2 className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draft.base_url}
                  onChange={(event) => updateDraft({ base_url: event.target.value })}
                  placeholder="https://api.example.com/v1"
                  className={cn('h-7 pl-7 text-xs font-mono', errors.base_url && 'border-destructive')}
                />
              </div>
              {errors.base_url ? <p className="text-[10px] text-destructive">{errors.base_url}</p> : null}
            </FieldGroup>
          </PanelSection>

          <PanelSection title="Prompting" description="Instruction file plus optional inline override">
            <FieldGroup label="Instruction File">
              <div className="relative">
                <FileCode2 className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draft.instruction_file}
                  onChange={(event) => updateDraft({ instruction_file: event.target.value })}
                  placeholder={`${draft.role}.md`}
                  className="h-7 pl-7 text-xs font-mono"
                />
              </div>
            </FieldGroup>

            <FieldGroup label="Inline Instructions" hint="Overrides instruction file when set">
              <Textarea
                value={draft.instructions}
                onChange={(event) => updateDraft({ instructions: event.target.value })}
                rows={4}
                className="text-xs font-mono"
                placeholder="Write node-specific runtime instructions..."
              />
            </FieldGroup>
          </PanelSection>

          <PanelSection title="Advanced Payload" description="Raw JSON passed with role runtime settings">
            <FieldGroup label="Auth Headers (JSON)">
              <Textarea
                value={draft.auth_headers_json}
                onChange={(event) => updateDraft({ auth_headers_json: event.target.value })}
                rows={4}
                className={cn('text-xs font-mono', errors.auth_headers_json && 'border-destructive')}
              />
              {errors.auth_headers_json ? <p className="text-[10px] text-destructive">{errors.auth_headers_json}</p> : null}
            </FieldGroup>

            <FieldGroup label="Extra Runtime Payload (JSON)">
              <Textarea
                value={draft.extra_json}
                onChange={(event) => updateDraft({ extra_json: event.target.value })}
                rows={4}
                className={cn('text-xs font-mono', errors.extra_json && 'border-destructive')}
              />
              {errors.extra_json ? <p className="text-[10px] text-destructive">{errors.extra_json}</p> : null}
            </FieldGroup>

            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-200/90">
              <CircleAlert className="inline h-3 w-3 mr-1" />
              Save Node, then use Run Setup with "Save New Profile + Run" to persist these settings to backend.
            </div>
          </PanelSection>
        </div>
      )}
    </PanelShell>
  )
}
