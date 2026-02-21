import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type {
  AfkCapabilities,
  OrchestrationProfile,
  PricingProfilePayload,
  ProviderCredential,
  ProviderValidation,
  QueueStats,
  SecretAccessAudit,
  SecretKey,
  SecretKeyEvent,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

function formatTime(value?: string | null): string {
  if (!value) return 'n/a'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function SettingsPanel() {
  /* ------------------------------------------------------------------ */
  /*  Credentials                                                        */
  /* ------------------------------------------------------------------ */
  const [credentials, setCredentials] = useState<ProviderCredential[]>([])
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [providerType, setProviderType] = useState<'managed_llm_runtime' | 'openai_compatible'>('managed_llm_runtime')
  const [credentialName, setCredentialName] = useState('provider-key-main')
  const [apiKey, setApiKey] = useState('')
  const [keyVersion, setKeyVersion] = useState('v1')
  const [credentialAudits, setCredentialAudits] = useState<SecretAccessAudit[]>([])

  /* ------------------------------------------------------------------ */
  /*  Key Lifecycle                                                      */
  /* ------------------------------------------------------------------ */
  const [secretKeys, setSecretKeys] = useState<SecretKey[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [keyMaterial, setKeyMaterial] = useState('')
  const [keyEvents, setKeyEvents] = useState<SecretKeyEvent[]>([])

  /* ------------------------------------------------------------------ */
  /*  Validation                                                         */
  /* ------------------------------------------------------------------ */
  const [model, setModel] = useState('gpt-4.1-mini')
  const [baseUrl, setBaseUrl] = useState('')
  const [validation, setValidation] = useState<ProviderValidation | null>(null)

  /* ------------------------------------------------------------------ */
  /*  Queue Stats                                                        */
  /* ------------------------------------------------------------------ */
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)

  /* ------------------------------------------------------------------ */
  /*  Capabilities                                                       */
  /* ------------------------------------------------------------------ */
  const [capabilities, setCapabilities] = useState<AfkCapabilities | null>(null)

  /* ------------------------------------------------------------------ */
  /*  Orchestration Profiles                                             */
  /* ------------------------------------------------------------------ */
  const [orchProfiles, setOrchProfiles] = useState<OrchestrationProfile[]>([])
  const [expandedOrchId, setExpandedOrchId] = useState('')
  const [orchName, setOrchName] = useState('')
  const [orchDescription, setOrchDescription] = useState('')
  const [orchConfigJson, setOrchConfigJson] = useState('{}')
  const [orchEditStatus, setOrchEditStatus] = useState('')

  /* ------------------------------------------------------------------ */
  /*  Pricing Profiles                                                   */
  /* ------------------------------------------------------------------ */
  const [pricingLookupId, setPricingLookupId] = useState('')
  const [pricingProfile, setPricingProfile] = useState<PricingProfilePayload | null>(null)
  const [pricingName, setPricingName] = useState('')
  const [pricingCurrency, setPricingCurrency] = useState('USD')
  const [pricingFallback, setPricingFallback] = useState('block')
  const [pricingModelsJson, setPricingModelsJson] = useState('[]')

  const [busy, setBusy] = useState(false)

  const selectedCredential = useMemo(
    () => credentials.find((row) => row.id === selectedCredentialId) ?? null,
    [credentials, selectedCredentialId],
  )

  /* ================================================================== */
  /*  Loaders                                                            */
  /* ================================================================== */

  async function loadAll() {
    setBusy(true)
    try {
      const [creds, keys, events] = await Promise.all([
        api.listProviderCredentials(),
        api.listSecurityKeys(),
        api.listSecurityKeyEvents(),
      ])
      setCredentials(creds.credentials)
      setSecretKeys(keys.keys)
      setKeyEvents(events.events)
      if (!selectedCredentialId && creds.credentials.length > 0) setSelectedCredentialId(creds.credentials[0].id)
      if (!selectedKeyId && keys.keys.length > 0) setSelectedKeyId(keys.keys[0].id)
    } finally {
      setBusy(false)
    }
  }

  async function loadCredentialAudits(credentialId: string) {
    try {
      const data = await api.getProviderCredentialAudits(credentialId)
      setCredentialAudits(data.audits)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load credential audits')
    }
  }

  async function loadQueueStats() {
    try {
      const stats = await api.getQueueStats()
      setQueueStats(stats)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load queue stats')
    }
  }

  async function loadCapabilities() {
    try {
      const caps = await api.getCapabilities()
      setCapabilities(caps)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load capabilities')
    }
  }

  async function loadOrchProfiles() {
    try {
      const data = await api.listOrchestrationProfiles()
      setOrchProfiles(data.profiles)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load orchestration profiles')
    }
  }

  /* ================================================================== */
  /*  Effects                                                            */
  /* ================================================================== */

  useEffect(() => { void loadAll() }, [])

  useEffect(() => {
    if (selectedCredentialId) void loadCredentialAudits(selectedCredentialId)
    else setCredentialAudits([])
  }, [selectedCredentialId])

  useEffect(() => {
    void loadQueueStats()
    const interval = setInterval(() => { void loadQueueStats() }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { void loadCapabilities() }, [])

  useEffect(() => { void loadOrchProfiles() }, [])

  /* ================================================================== */
  /*  Actions                                                            */
  /* ================================================================== */

  async function createKey() {
    if (!keyMaterial.trim()) { toast.error('Key material is required'); return }
    try {
      await api.createSecurityKey({ version: keyVersion, key_material: keyMaterial, actor: 'ui' })
      toast.success(`Created key ${keyVersion}`)
      setKeyMaterial('')
      await loadAll()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create key') }
  }

  async function activateKey() {
    if (!selectedKeyId) return
    try { await api.activateSecurityKey(selectedKeyId); toast.success('Key activated'); await loadAll() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to activate key') }
  }

  async function reencryptKey() {
    if (!selectedKeyId) return
    try { const out = await api.reencryptCredentials(selectedKeyId); toast.success(`Re-encrypted ${out.updated}/${out.total} credentials`); await loadAll() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to re-encrypt credentials') }
  }

  async function retireKey() {
    if (!selectedKeyId) return
    try { await api.retireSecurityKey(selectedKeyId); toast.success('Key retired'); await loadAll() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to retire key') }
  }

  async function createCredential() {
    if (!apiKey.trim()) { toast.error('API key is required'); return }
    try {
      const created = await api.createProviderCredential({ name: credentialName, provider_type: providerType, api_key: apiKey, status: 'active' })
      setApiKey('')
      setSelectedCredentialId(created.id)
      toast.success('Credential created')
      await loadAll()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create credential') }
  }

  async function rotateCredential() {
    if (!selectedCredentialId || !apiKey.trim()) { toast.error('Select credential and provide new API key'); return }
    try {
      await api.rotateProviderCredential(selectedCredentialId, { api_key: apiKey, key_version: keyVersion })
      setApiKey('')
      toast.success('Credential rotated')
      await loadAll()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to rotate credential') }
  }

  async function validateProvider() {
    setValidation(null)
    try {
      const out = await api.validateProvider({
        provider_type: providerType,
        model: model || undefined,
        base_url: baseUrl || undefined,
        credential_id: selectedCredentialId || undefined,
        api_key: !selectedCredentialId ? apiKey || undefined : undefined,
      })
      setValidation(out)
      if (out.valid) toast.success('Validation succeeded')
      else toast.error('Validation failed')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Provider validation failed') }
  }

  async function createOrchProfile() {
    if (!orchName.trim()) { toast.error('Profile name is required'); return }
    let config: Record<string, unknown>
    try { config = JSON.parse(orchConfigJson) } catch { toast.error('Invalid JSON in config'); return }
    try {
      await api.createOrchestrationProfile({ name: orchName, description: orchDescription || undefined, config })
      toast.success('Orchestration profile created')
      setOrchName('')
      setOrchDescription('')
      setOrchConfigJson('{}')
      await loadOrchProfiles()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create orchestration profile') }
  }

  async function updateOrchProfileStatus(profileId: string) {
    if (!orchEditStatus.trim()) { toast.error('Status is required'); return }
    try {
      await api.updateOrchestrationProfile(profileId, { status: orchEditStatus })
      toast.success('Profile status updated')
      setOrchEditStatus('')
      await loadOrchProfiles()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update profile') }
  }

  async function lookupPricingProfile() {
    if (!pricingLookupId.trim()) { toast.error('Profile ID is required'); return }
    try {
      const profile = await api.getPricingProfile(pricingLookupId)
      setPricingProfile(profile)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load pricing profile') }
  }

  async function createPricingProfile() {
    if (!pricingName.trim()) { toast.error('Profile name is required'); return }
    let models: unknown[]
    try { models = JSON.parse(pricingModelsJson) } catch { toast.error('Invalid JSON in models array'); return }
    try {
      const created = await api.createPricingProfile({
        name: pricingName,
        currency: pricingCurrency,
        fallback_policy: pricingFallback,
        models,
      })
      toast.success('Pricing profile created')
      setPricingProfile(created)
      setPricingName('')
      setPricingCurrency('USD')
      setPricingFallback('block')
      setPricingModelsJson('[]')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create pricing profile') }
  }

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  return (
    <ScrollArea className="h-full">
      <div className="px-4 pt-14 pb-6">
        <Tabs defaultValue="credentials" className="space-y-4">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <TabsList className="rounded-full">
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
              <TabsTrigger value="keys">Key Lifecycle</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="queue">Queue Stats</TabsTrigger>
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="orchestration">Orchestration</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
            </TabsList>
          </motion.div>

          {/* -------------------------------------------------------------- */}
          {/*  Credentials Tab                                                */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="credentials" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Credential Registry</CardTitle>
                  <CardDescription className="text-xs">Encrypted provider credentials bound to active local key version.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Provider</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {credentials.map((row) => (
                          <TableRow key={row.id} onClick={() => setSelectedCredentialId(row.id)} className="cursor-pointer">
                            <TableCell className="text-xs">{row.name}</TableCell>
                            <TableCell className="text-xs">{row.provider_type}</TableCell>
                            <TableCell className="text-xs">{row.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Provider Type</Label>
                      <Select value={providerType} onValueChange={(v) => setProviderType(v as 'managed_llm_runtime' | 'openai_compatible')}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="managed_llm_runtime">managed_llm_runtime</SelectItem>
                          <SelectItem value="openai_compatible">openai_compatible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Credential Name</Label>
                      <Input value={credentialName} onChange={(e) => setCredentialName(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">API Key</Label>
                      <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={createCredential}>Create</Button>
                    <Button size="sm" variant="secondary" onClick={rotateCredential}>Rotate</Button>
                    <Button size="sm" variant="outline" onClick={loadAll} disabled={busy}>Refresh</Button>
                  </div>
                  {selectedCredential && <p className="text-xs text-muted-foreground">Selected: {selectedCredential.name}</p>}
                </CardContent>
              </Card>
            </motion.div>

            {selectedCredentialId && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}>
                <Card className="bg-card/60 backdrop-blur-xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Credential Audit Log</CardTitle>
                    <CardDescription className="text-xs">Access audit trail for the selected credential.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {credentialAudits.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No audit entries found.</p>
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Action</TableHead>
                              <TableHead className="text-xs">Actor</TableHead>
                              <TableHead className="text-xs">Success</TableHead>
                              <TableHead className="text-xs">Error</TableHead>
                              <TableHead className="text-xs">Time</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {credentialAudits.map((audit) => (
                              <TableRow key={audit.id}>
                                <TableCell className="text-xs">{audit.action}</TableCell>
                                <TableCell className="text-xs">{audit.actor}</TableCell>
                                <TableCell>
                                  <Badge variant={audit.success ? 'default' : 'destructive'} className="text-[10px]">
                                    {audit.success ? 'yes' : 'no'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{audit.error ?? '-'}</TableCell>
                                <TableCell className="text-xs">{formatTime(audit.created_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Key Lifecycle Tab                                              */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="keys" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Secret Key Lifecycle</CardTitle>
                  <CardDescription className="text-xs">Create, activate, re-encrypt credentials, and retire local DB keys.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Version</Label>
                      <Input value={keyVersion} onChange={(e) => setKeyVersion(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Key Material</Label>
                      <Input type="password" value={keyMaterial} onChange={(e) => setKeyMaterial(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <Button size="sm" onClick={createKey}>Create Key</Button>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Version</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Activated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {secretKeys.map((row) => (
                          <TableRow key={row.id} onClick={() => setSelectedKeyId(row.id)} className="cursor-pointer">
                            <TableCell className="text-xs">{row.version}</TableCell>
                            <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{row.status}</Badge></TableCell>
                            <TableCell className="text-xs">{formatTime(row.activated_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={activateKey} disabled={!selectedKeyId}>Activate</Button>
                    <Button size="sm" variant="secondary" onClick={reencryptKey} disabled={!selectedKeyId}>Re-encrypt</Button>
                    <Button size="sm" variant="outline" onClick={retireKey} disabled={!selectedKeyId}>Retire</Button>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Action</TableHead>
                          <TableHead className="text-xs">Actor</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keyEvents.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="text-xs">{event.action}</TableCell>
                            <TableCell className="text-xs">{event.actor}</TableCell>
                            <TableCell className="text-xs">{formatTime(event.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Validation Tab                                                 */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="validation" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Provider Validation</CardTitle>
                  <CardDescription className="text-xs">Multi-probe validation with capability confidence.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Model</Label>
                      <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Base URL (openai_compatible)</Label>
                      <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="h-8 text-xs" placeholder="https://api..." />
                    </div>
                  </div>
                  <Button size="sm" onClick={validateProvider}>Validate</Button>

                  {validation && (
                    <div className="space-y-2 rounded-md border p-3 text-xs">
                      <p>Status: <Badge variant={validation.valid ? 'default' : 'destructive'} className="text-[10px]">{validation.valid ? 'valid' : 'invalid'}</Badge></p>
                      <p>Confidence: {(validation.capability_confidence ?? 0).toFixed(2)}</p>
                      <p>Discovery: {validation.model_discovery_mode ?? 'inferred'}</p>
                      {validation.probe_results?.map((probe) => (
                        <p key={`${probe.probe}-${probe.status}`} className="font-mono text-[10px]">{probe.probe}: {probe.status} ({Math.round(probe.latency_ms)}ms)</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Queue Stats Tab                                                */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="queue" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Queue Stats</CardTitle>
                  <CardDescription className="text-xs">Live worker queue metrics. Auto-refreshes every 5 seconds.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { key: 'pending', label: 'Pending' },
                      { key: 'dlq_pending', label: 'DLQ Pending' },
                      { key: 'workers', label: 'Workers' },
                      { key: 'live_workers', label: 'Live Workers' },
                      { key: 'started', label: 'Started' },
                      { key: 'backend', label: 'Backend' },
                    ] as const).map((item, i) => (
                      <motion.div
                        key={item.key}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.06 * (i + 2) }}
                      >
                        <Card className="bg-card/60">
                          <CardContent className="pt-4 pb-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                            {item.key === 'backend' ? (
                              <Badge variant="secondary" className="mt-1 text-[10px]">
                                {queueStats?.backend ?? '-'}
                              </Badge>
                            ) : (
                              <p className="text-lg font-semibold">
                                {queueStats ? queueStats[item.key] : '-'}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Capabilities Tab                                               */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="capabilities" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">AFK Capabilities</CardTitle>
                  <CardDescription className="text-xs">Runtime capability manifest and supported interaction modes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {capabilities ? (
                    <>
                      <div className="space-y-2 rounded-md border p-3">
                        <p className="text-xs"><span className="text-muted-foreground">Version:</span> <Badge variant="secondary" className="text-[10px]">{capabilities.version}</Badge></p>
                        <p className="text-xs"><span className="text-muted-foreground">Default Mode:</span> {capabilities.interaction_mode_default}</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Supported Interaction Modes</Label>
                        <div className="flex flex-wrap gap-1">
                          {capabilities.supported_interaction_modes.map((mode) => (
                            <Badge key={mode} variant="outline" className="text-[10px]">{mode}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Router Strategies</Label>
                        <div className="flex flex-wrap gap-1">
                          {capabilities.subagent_router_strategies.map((strategy) => (
                            <Badge key={strategy} variant="outline" className="text-[10px]">{strategy}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Policy Profiles</Label>
                        <div className="flex flex-wrap gap-1">
                          {capabilities.policy_profiles.map((profile) => (
                            <Badge key={profile} variant="outline" className="text-[10px]">{profile}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">High Impact Features</Label>
                        {capabilities.high_impact_features.length === 0 ? (
                          <p className="text-xs text-muted-foreground">None reported.</p>
                        ) : (
                          <div className="space-y-1">
                            {capabilities.high_impact_features.map((feature, i) => (
                              <pre key={i} className="rounded-md border bg-muted/30 p-2 text-[10px] overflow-x-auto">
                                {JSON.stringify(feature, null, 2)}
                              </pre>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Recommended Profiles</Label>
                        <pre className="rounded-md border bg-muted/30 p-2 text-[10px] overflow-x-auto">
                          {JSON.stringify(capabilities.recommended_profiles, null, 2)}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading capabilities...</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Orchestration Profiles Tab                                     */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="orchestration" className="space-y-4">
            {/* Profile list */}
            {orchProfiles.map((profile, i) => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06 * (i + 1) }}
              >
                <Card className="bg-card/60 backdrop-blur-xl">
                  <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedOrchId(expandedOrchId === profile.id ? '' : profile.id)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{profile.name}</CardTitle>
                      <Badge variant={profile.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{profile.status}</Badge>
                    </div>
                    <CardDescription className="text-xs">{profile.description ?? 'No description'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Version: {profile.version}</span>
                      <span>Created: {formatTime(profile.created_at)}</span>
                    </div>

                    {expandedOrchId === profile.id && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Config JSON</Label>
                          <pre className="rounded-md border bg-muted/30 p-2 text-[10px] overflow-x-auto max-h-48 overflow-y-auto">
                            {JSON.stringify(profile.config, null, 2)}
                          </pre>
                        </div>

                        <div className="flex items-end gap-2">
                          <div className="space-y-2 flex-1">
                            <Label className="text-xs">Update Status</Label>
                            <Input
                              value={orchEditStatus}
                              onChange={(e) => setOrchEditStatus(e.target.value)}
                              className="h-8 text-xs"
                              placeholder="active / draft / archived"
                            />
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => updateOrchProfileStatus(profile.id)}>Update</Button>
                        </div>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {orchProfiles.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
                <p className="text-xs text-muted-foreground">No orchestration profiles found.</p>
              </motion.div>
            )}

            {/* Create new profile */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06 * (orchProfiles.length + 2) }}
            >
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Create Orchestration Profile</CardTitle>
                  <CardDescription className="text-xs">Define a new orchestration profile with a JSON config.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Name</Label>
                      <Input value={orchName} onChange={(e) => setOrchName(e.target.value)} className="h-8 text-xs" placeholder="my-orch-profile" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Description</Label>
                      <Input value={orchDescription} onChange={(e) => setOrchDescription(e.target.value)} className="h-8 text-xs" placeholder="Optional description" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Config (JSON)</Label>
                      <Textarea
                        value={orchConfigJson}
                        onChange={(e) => setOrchConfigJson(e.target.value)}
                        className="min-h-24 font-mono text-xs"
                        placeholder="{}"
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={createOrchProfile}>Create</Button>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* -------------------------------------------------------------- */}
          {/*  Pricing Profiles Tab                                           */}
          {/* -------------------------------------------------------------- */}
          <TabsContent value="pricing" className="space-y-4">
            {/* Lookup */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Lookup Pricing Profile</CardTitle>
                  <CardDescription className="text-xs">Retrieve a pricing profile by ID.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="space-y-2 flex-1">
                      <Label className="text-xs">Profile ID</Label>
                      <Input value={pricingLookupId} onChange={(e) => setPricingLookupId(e.target.value)} className="h-8 text-xs" placeholder="uuid" />
                    </div>
                    <Button size="sm" onClick={lookupPricingProfile}>Lookup</Button>
                  </div>

                  {pricingProfile && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-3 rounded-md border p-3">
                      <div className="space-y-1 text-xs">
                        <p><span className="text-muted-foreground">Name:</span> {pricingProfile.name}</p>
                        <p><span className="text-muted-foreground">Currency:</span> <Badge variant="secondary" className="text-[10px]">{pricingProfile.currency}</Badge></p>
                        <p><span className="text-muted-foreground">Fallback Policy:</span> <Badge variant="outline" className="text-[10px]">{pricingProfile.fallback_policy}</Badge></p>
                      </div>

                      {pricingProfile.models.length > 0 && (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Provider</TableHead>
                                <TableHead className="text-xs">Model</TableHead>
                                <TableHead className="text-xs">Input/1k</TableHead>
                                <TableHead className="text-xs">Output/1k</TableHead>
                                <TableHead className="text-xs">Reasoning/1k</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pricingProfile.models.map((m, i) => (
                                <TableRow key={`${m.provider_name}-${m.model}-${i}`}>
                                  <TableCell className="text-xs">{m.provider_name}</TableCell>
                                  <TableCell className="text-xs">{m.model}</TableCell>
                                  <TableCell className="text-xs">{m.input_per_1k}</TableCell>
                                  <TableCell className="text-xs">{m.output_per_1k}</TableCell>
                                  <TableCell className="text-xs">{m.reasoning_per_1k}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Create */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}>
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Create Pricing Profile</CardTitle>
                  <CardDescription className="text-xs">Define per-model pricing with a fallback policy.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Name</Label>
                      <Input value={pricingName} onChange={(e) => setPricingName(e.target.value)} className="h-8 text-xs" placeholder="default-pricing" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Currency</Label>
                        <Input value={pricingCurrency} onChange={(e) => setPricingCurrency(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fallback Policy</Label>
                        <Select value={pricingFallback} onValueChange={setPricingFallback}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="block">block</SelectItem>
                            <SelectItem value="allow">allow</SelectItem>
                            <SelectItem value="warn">warn</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Models (JSON array)</Label>
                      <Textarea
                        value={pricingModelsJson}
                        onChange={(e) => setPricingModelsJson(e.target.value)}
                        className="min-h-24 font-mono text-xs"
                        placeholder='[{"provider_name":"openai","model":"gpt-4","input_per_1k":0.03,"output_per_1k":0.06,"reasoning_per_1k":0.0}]'
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={createPricingProfile}>Create</Button>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
