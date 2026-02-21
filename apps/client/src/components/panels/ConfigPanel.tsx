import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Zap, Shield, Microscope, GitBranch, Moon, Rocket, CheckCircle2 } from 'lucide-react'

import { api } from '@/lib/api'
import { loadState, saveState } from '@/lib/state'
import { configTemplates, type ConfigTemplate } from '@/lib/config-templates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'

const iconMap: Record<string, typeof Zap> = { Zap, Shield, Microscope, GitBranch, Moon }
const stagger = (i: number) => ({ duration: 0.4, delay: i * 0.06 })

export function ConfigPanel({ onRunLaunched }: { onRunLaunched: (runId: string) => void }) {
  const persisted = useMemo(() => loadState(), [])

  /* --- Session --- */
  const [sessionName, setSessionName] = useState('Reliability Evaluation')
  const [sessionOwner, setSessionOwner] = useState('platform-team')
  const [profileName, setProfileName] = useState('default-profile')

  /* --- Target --- */
  const [targetType, setTargetType] = useState<string>('managed_llm_runtime')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [providerName, setProviderName] = useState('openai')
  const [apiKeyRef, setApiKeyRef] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [inlineApiKey, setInlineApiKey] = useState('')

  /* --- Benchmark --- */
  const [taxonomy, setTaxonomy] = useState('prompt_injection,jailbreak')
  const [seed, setSeed] = useState(42)
  const [curatedRatio, setCuratedRatio] = useState(0.6)
  const [strictness, setStrictness] = useState('balanced')
  const [activeAdjudication, setActiveAdjudication] = useState(true)

  /* --- Orchestration --- */
  const [joinPolicy, setJoinPolicy] = useState('all_required')
  const [routerStrategy, setRouterStrategy] = useState('taxonomy')
  const [maxSubagents, setMaxSubagents] = useState(3)

  /* --- Runtime --- */
  const [preset, setPreset] = useState<string>('standard')
  const [mode, setMode] = useState<string>('deterministic_ci')
  const [budgetUsd, setBudgetUsd] = useState(5)
  const [maxConcurrency, setMaxConcurrency] = useState(8)
  const [baselineRunId, setBaselineRunId] = useState(persisted.baselineRunId ?? '')

  const [busy, setBusy] = useState(false)

  /* --- Readiness --- */
  const readiness = useMemo(() => {
    let score = 0
    if (model.trim()) score += 25
    if (profileName.trim()) score += 25
    if (taxonomy.trim()) score += 25
    if (budgetUsd > 0) score += 25
    return score
  }, [model, profileName, taxonomy, budgetUsd])

  /* --- Hydrate from saved profile --- */
  useEffect(() => {
    const id = persisted.configProfileId
    if (!id) return
    api.getConfigProfile(id).then((profile) => {
      setProfileName(profile.name)
      setStrictness(profile.strictness_mode)
      const tc = profile.target_config as Record<string, string>
      if (tc.target_type) setTargetType(tc.target_type)
      if (tc.model) setModel(tc.model)
      if (tc.provider_name) setProviderName(tc.provider_name)
      const bc = profile.benchmark_config as Record<string, unknown>
      if (bc.taxonomy) setTaxonomy(String(bc.taxonomy))
      if (bc.seed != null) setSeed(Number(bc.seed))
      if (bc.curated_ratio != null) setCuratedRatio(Number(bc.curated_ratio))
      const rc = profile.runtime_config as Record<string, unknown>
      if (rc.budget_usd != null) setBudgetUsd(Number(rc.budget_usd))
      if (rc.max_concurrency != null) setMaxConcurrency(Number(rc.max_concurrency))
    }).catch(() => {/* ignore missing profile */})
  }, [])

  /* --- Apply template --- */
  function applyTemplate(t: ConfigTemplate) {
    const c = t.config
    setSessionName(c.sessionName)
    setSessionOwner(c.sessionOwner)
    setProfileName(c.profileName)
    setTargetType(c.targetType)
    setModel(c.model)
    setProviderName(c.providerName)
    setTaxonomy(c.taxonomy)
    setSeed(c.seed)
    setCuratedRatio(c.curatedRatio)
    setStrictness(c.strictness)
    setActiveAdjudication(c.activeAdjudication)
    setJoinPolicy(c.joinPolicy)
    setRouterStrategy(c.routerStrategy)
    setMaxSubagents(c.maxSubagents)
    setPreset(c.preset)
    setMode(c.mode)
    setBudgetUsd(c.budgetUsd)
    setMaxConcurrency(c.maxConcurrency)
    toast.success(`Template "${t.name}" applied`)
  }

  /* --- Launch --- */
  async function launchRun() {
    if (readiness < 100) {
      toast.error('Complete all required fields before launching.')
      return
    }
    setBusy(true)
    try {
      const session = await api.createSession({ name: sessionName, owner: sessionOwner })
      const configProfile = await api.createConfigProfile({
        session_id: session.id,
        name: profileName,
        strictness_mode: strictness,
        target_config: {
          target_type: targetType,
          model,
          provider_name: providerName,
          api_key_ref: apiKeyRef || undefined,
          base_url: baseUrl || undefined,
          inline_api_key: inlineApiKey || undefined,
        },
        benchmark_config: {
          taxonomy,
          seed,
          curated_ratio: curatedRatio,
        },
        scoring_config: { active_adjudication: activeAdjudication },
        runtime_config: {
          join_policy: joinPolicy,
          router_strategy: routerStrategy,
          max_subagents: maxSubagents,
          budget_usd: budgetUsd,
          max_concurrency: maxConcurrency,
        },
      })
      const run = await api.createRun({
        session_id: session.id,
        config_profile_id: configProfile.id,
        preset,
        mode,
        budget_usd: budgetUsd,
        max_concurrency: maxConcurrency,
        baseline_run_id: baselineRunId || undefined,
      })
      saveState({
        sessionId: session.id,
        configProfileId: configProfile.id,
        currentRunId: run.id,
        baselineRunId: baselineRunId || undefined,
      })
      toast.success(`Run ${run.id} launched`)
      onRunLaunched(run.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to launch run')
    } finally {
      setBusy(false)
    }
  }

  async function validateTarget() {
    try {
      const result = await api.validateProvider({
        provider_type: targetType,
        model: model || undefined,
        base_url: baseUrl || undefined,
        api_key: inlineApiKey || undefined,
      })
      if (result.valid) toast.success('Provider validated')
      else toast.error(`Validation failed: ${result.error_class ?? 'unknown'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation failed')
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 px-4 pt-14 pb-48">
        {/* Template Picker */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(0)}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Start Templates</p>
          <div className="grid grid-cols-2 gap-2">
            {configTemplates.map((t, i) => {
              const Icon = iconMap[t.icon] ?? Zap
              return (
                <Tooltip key={t.id}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={stagger(i)}
                    >
                      <Card
                        className="cursor-pointer hover:border-primary/50 transition-colors bg-card/60"
                        onClick={() => applyTemplate(t)}
                      >
                        <CardContent className="p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <Icon className="size-3.5 text-primary" />
                            <span className="text-xs font-semibold">{t.name}</span>
                          </div>
                          <CardDescription className="text-[10px] line-clamp-2">{t.description}</CardDescription>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    {t.description}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </motion.div>

        <Separator />

        {/* Session Info */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(1)} className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Session</p>
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Owner</Label>
              <Input value={sessionOwner} onChange={(e) => setSessionOwner(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Profile</Label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </motion.div>

        <Separator />

        {/* Target */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(2)} className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target</p>
          <div className="space-y-2">
            <Label className="text-xs">Type</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['managed_llm_runtime', 'managed_agent_runtime', 'http', 'openai_compatible', 'agent_http'].map((v) => (
                  <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Provider</Label>
              <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">API Key Ref</Label>
            <Input value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)} className="h-8 text-xs" placeholder="credential ID" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="h-8 text-xs" placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Inline API Key</Label>
            <Input type="password" value={inlineApiKey} onChange={(e) => setInlineApiKey(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={validateTarget}>
            <CheckCircle2 className="size-3 mr-1" /> Validate
          </Button>
        </motion.div>

        <Separator />

        {/* Benchmark */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(3)} className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benchmark</p>
          <div className="space-y-2">
            <Label className="text-xs">Taxonomy</Label>
            <Textarea value={taxonomy} onChange={(e) => setTaxonomy(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Seed</Label>
              <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Curated Ratio</Label>
              <Input type="number" step={0.1} min={0} max={1} value={curatedRatio} onChange={(e) => setCuratedRatio(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Strictness</Label>
              <Input value={strictness} onChange={(e) => setStrictness(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={activeAdjudication} onCheckedChange={setActiveAdjudication} />
            <Label className="text-xs">Active Adjudication</Label>
          </div>
        </motion.div>

        <Separator />

        {/* Orchestration */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={stagger(4)} className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orchestration</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Join Policy</Label>
              <Input value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Router</Label>
              <Input value={routerStrategy} onChange={(e) => setRouterStrategy(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Subagents</Label>
              <Input type="number" value={maxSubagents} onChange={(e) => setMaxSubagents(Number(e.target.value))} className="h-8 text-xs" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sticky Run Launcher */}
      <div className="sticky bottom-0 border-t bg-card/90 backdrop-blur-xl p-4 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Config Readiness</span>
            <span>{readiness}%</span>
          </div>
          <Progress value={readiness} className="h-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Preset</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['quick', 'standard', 'deep'].map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['deterministic_ci', 'live_nightly'].map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Budget ($)</Label>
            <Input type="number" value={budgetUsd} onChange={(e) => setBudgetUsd(Number(e.target.value))} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Concurrency</Label>
            <Input type="number" value={maxConcurrency} onChange={(e) => setMaxConcurrency(Number(e.target.value))} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Baseline</Label>
            <Input value={baselineRunId} onChange={(e) => setBaselineRunId(e.target.value)} className="h-7 text-xs" placeholder="run-id" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">{targetType}</Badge>
          <Badge variant="outline" className="text-[10px]">{model}</Badge>
          <Badge variant="outline" className="text-[10px]">${budgetUsd}</Badge>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="w-full gap-2"
              onClick={launchRun}
              disabled={busy || readiness < 100}
              data-onboarding="launch-button"
            >
              <Rocket className="size-4" />
              {busy ? 'Launching...' : 'Launch Run'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {readiness < 100 ? 'Complete all required fields' : 'Launch a new evaluation run'}
          </TooltipContent>
        </Tooltip>
      </div>
    </ScrollArea>
  )
}
