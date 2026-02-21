import { useEffect, useMemo, useState } from 'react'
import { Boxes, FileCode2, KeyRound, Settings2, Sparkles } from 'lucide-react'
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

type StudioNode = {
  id: string
  data: {
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
}

export function StudioInspectorPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.activePanel === 'studio-inspector'

  const studioNodes = useMemo(
    () => state.studioNodes.filter((node) => node.type === 'studioRole'),
    [state.studioNodes],
  )

  const selectedNode = useMemo<StudioNode | null>(() => {
    const selected = studioNodes.find((node) => node.id === state.selectedNodeId)
    return (selected as StudioNode | undefined) ?? (studioNodes[0] as StudioNode | undefined) ?? null
  }, [studioNodes, state.selectedNodeId])

  const [authHeadersJson, setAuthHeadersJson] = useState('{}')
  const [extraJson, setExtraJson] = useState('{}')
  const [credentialOptions, setCredentialOptions] = useState<Array<{ id: string; name: string; provider_type: string }>>([])

  useEffect(() => {
    if (!selectedNode) return
    setAuthHeadersJson(JSON.stringify(selectedNode.data.auth_headers ?? {}, null, 2))
    setExtraJson(JSON.stringify(selectedNode.data.extra ?? {}, null, 2))
  }, [selectedNode?.id])

  useEffect(() => {
    if (!isOpen) return
    api
      .listProviderCredentials()
      .then((res) => setCredentialOptions((res.credentials ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        provider_type: row.provider_type,
      }))))
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !selectedNode) return
    if (state.selectedNodeId !== selectedNode.id) {
      dispatch({ type: 'SELECT_NODE', nodeId: selectedNode.id, attackType: null })
    }
  }, [isOpen, selectedNode?.id, state.selectedNodeId, dispatch])

  const updateNode = (partial: Partial<StudioNode['data']>) => {
    if (!selectedNode) return
    dispatch({ type: 'UPDATE_STUDIO_NODE', nodeId: selectedNode.id, data: partial })
  }

  const applyJsonField = (
    label: string,
    raw: string,
    onOk: (value: Record<string, unknown>) => void,
  ) => {
    try {
      const parsed = JSON.parse(raw || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Value must be a JSON object')
      }
      onOk(parsed as Record<string, unknown>)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON'
      toast.error(`${label}: ${message}`)
    }
  }

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="right"
      title="Studio Inspector"
      icon={<Boxes className="h-4 w-4" />}
      subtitle="Production runtime controls per orchestration node"
      width="w-[420px] lg:w-[470px]"
    >
      {state.canvasMode !== 'studio' ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="Switch to Studio mode"
          description="Open Studio mode on the bottom bar, then select a node to edit runtime settings."
        />
      ) : !selectedNode ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No studio node available"
          description="Add a role node in Studio mode to configure provider, model, credentials, and instructions."
        />
      ) : (
        <div className="space-y-0">
          <PanelSection
            title="Node"
            description="Select which orchestration node to edit"
            badge={<Badge variant="outline" className="text-[10px] h-4">{studioNodes.length}</Badge>}
          >
            <div className="flex flex-wrap gap-1.5">
              {studioNodes.map((node) => {
                const active = node.id === selectedNode.id
                return (
                  <Button
                    key={node.id}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className={cn('h-6 text-[10px]', !active && 'text-muted-foreground')}
                    onClick={() => dispatch({ type: 'SELECT_NODE', nodeId: node.id, attackType: null })}
                  >
                    {node.data.role}
                  </Button>
                )
              })}
            </div>
          </PanelSection>

          <PanelSection title="Identity" description="Node metadata and activation">
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Role">
                <Input value={selectedNode.data.role} readOnly className="h-7 text-xs font-mono bg-muted/30" />
              </FieldGroup>
              <FieldGroup label="Enabled" horizontal>
                <Switch checked={selectedNode.data.enabled ?? true} onCheckedChange={(value) => updateNode({ enabled: value })} />
              </FieldGroup>
            </div>
            <FieldGroup label="Label">
              <Input
                value={selectedNode.data.label ?? ''}
                onChange={(event) => updateNode({ label: event.target.value })}
                className="h-7 text-xs"
              />
            </FieldGroup>
            <FieldGroup label="Description">
              <Textarea
                value={selectedNode.data.description ?? ''}
                onChange={(event) => updateNode({ description: event.target.value })}
                rows={2}
                className="text-xs"
              />
            </FieldGroup>
          </PanelSection>

          <PanelSection title="LLM Runtime" description="Model/provider/credentials for this node only">
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Model">
                <Input
                  value={selectedNode.data.model ?? ''}
                  onChange={(event) => updateNode({ model: event.target.value })}
                  placeholder="gpt-4.1-mini"
                  className="h-7 text-xs font-mono"
                />
              </FieldGroup>
              <FieldGroup label="Provider">
                <Select
                  value={selectedNode.data.runtime_provider || 'litellm'}
                  onValueChange={(value) => updateNode({ runtime_provider: value })}
                >
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
                    value={selectedNode.data.api_key_ref || '__none__'}
                    onValueChange={(value) => updateNode({ api_key_ref: value === '__none__' ? '' : value })}
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
                    value={selectedNode.data.api_key_ref ?? ''}
                    onChange={(event) => updateNode({ api_key_ref: event.target.value })}
                    placeholder="credential-id..."
                    className="h-7 pl-7 text-xs font-mono"
                  />
                </div>
              </div>
            </FieldGroup>
            <FieldGroup label="Base URL" hint="Optional provider endpoint override">
              <Input
                value={selectedNode.data.base_url ?? ''}
                onChange={(event) => updateNode({ base_url: event.target.value })}
                placeholder="https://api.example.com/v1"
                className="h-7 text-xs font-mono"
              />
            </FieldGroup>
          </PanelSection>

          <PanelSection title="Prompting" description="Instruction file and inline override">
            <FieldGroup label="Instruction File">
              <div className="relative">
                <FileCode2 className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={selectedNode.data.instruction_file ?? ''}
                  onChange={(event) => updateNode({ instruction_file: event.target.value })}
                  placeholder={`${selectedNode.data.role}.md`}
                  className="h-7 pl-7 text-xs font-mono"
                />
              </div>
            </FieldGroup>
            <FieldGroup label="Custom Instructions" hint="If filled, this overrides file instructions for this role">
              <Textarea
                value={selectedNode.data.instructions ?? ''}
                onChange={(event) => updateNode({ instructions: event.target.value })}
                rows={4}
                className="text-xs font-mono"
                placeholder="Write node-level runtime instruction override..."
              />
            </FieldGroup>
          </PanelSection>

          <PanelSection title="Advanced" description="Headers and extra provider payload">
            <FieldGroup label="Auth Headers (JSON)">
              <Textarea
                value={authHeadersJson}
                onChange={(event) => setAuthHeadersJson(event.target.value)}
                onBlur={() => applyJsonField('Auth Headers', authHeadersJson, (value) => updateNode({ auth_headers: value as Record<string, string> }))}
                rows={4}
                className="text-xs font-mono"
              />
            </FieldGroup>
            <FieldGroup label="Extra Settings (JSON)">
              <Textarea
                value={extraJson}
                onChange={(event) => setExtraJson(event.target.value)}
                onBlur={() => applyJsonField('Extra Settings', extraJson, (value) => updateNode({ extra: value }))}
                rows={4}
                className="text-xs font-mono"
              />
            </FieldGroup>
            <div className="rounded-md border border-border/40 px-2.5 py-2 text-[10px] text-muted-foreground">
              <Settings2 className="inline h-3 w-3 mr-1" />
              These settings are embedded into each role in <code>benchmark_config.afk_orchestration.roles</code>.
            </div>
          </PanelSection>
        </div>
      )}
    </PanelShell>
  )
}
