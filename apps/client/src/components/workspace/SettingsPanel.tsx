import { useState, useEffect, useCallback } from 'react'
import {
  Settings2,
  Key,
  Shield,
  Plus,
  Trash2,
  RotateCw,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  RefreshCw,
  Server,
  Cpu,
  ChevronDown,
  ChevronRight,
  DollarSign,
  ListOrdered,
  ClipboardList,
  AlertCircle,
  Check,
  Copy,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PanelShell, PanelSection, MetricRow, EmptyState } from './PanelShell'
import { useWorkspace } from '@/stores/workspace-store'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ── Credentials Section ── */
function CredentialsSection() {
  const [creds, setCreds] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProvider, setNewProvider] = useState('')
  const [newKey, setNewKey] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const fetchCreds = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listProviderCredentials()
      setCreds(data.credentials)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCreds() }, [fetchCreds])

  const handleAdd = async () => {
    try {
      await api.createProviderCredential({ name: newName, provider_type: newProvider, api_key: newKey })
      toast.success('Credential created')
      setShowAdd(false); setNewName(''); setNewProvider(''); setNewKey('')
      fetchCreds()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleRotate = async (id: string) => {
    const key = prompt('Enter new API key:')
    if (!key) return
    try {
      await api.rotateProviderCredential(id, { api_key: key })
      toast.success('Key rotated')
      fetchCreds()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProviderCredential(id)
      toast.success('Credential deleted')
      fetchCreds()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <PanelSection
      title="Provider Credentials"
      badge={<Badge variant="outline" className="text-[10px] h-4">{creds.length}</Badge>}
    >
      {loading && creds.length === 0 ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : creds.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60 py-2">No credentials stored</p>
      ) : (
        <div className="space-y-1.5">
          {creds.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/20 group">
              <Key className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{c.name}</p>
                <p className="text-[9px] text-muted-foreground font-mono">{c.provider_type}</p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRotate(c.id)}>
                  <RotateCw className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 mt-2 p-2 rounded-lg border border-primary/20 bg-primary/5">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Credential name" className="h-7 text-xs" />
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Provider type" /></SelectTrigger>
                <SelectContent>
                  {['openai', 'anthropic', 'google', 'azure', 'mistral', 'deepseek', 'fireworks', 'groq', 'together', 'custom'].map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="API Key" type="password" className="h-7 text-xs font-mono" />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleAdd} disabled={!newName || !newProvider || !newKey}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button variant="outline" size="sm" className="h-6 text-[10px] w-full mt-2" onClick={() => setShowAdd(!showAdd)}>
        <Plus className="h-3 w-3 mr-1" /> Add Credential
      </Button>
    </PanelSection>
  )
}

/* ── Security Keys Section ── */
function SecurityKeysSection() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listSecurityKeys()
      setKeys(data.keys)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleCreate = async () => {
    try {
      await api.createSecurityKey({
        version: crypto.randomUUID(),
        key_material: crypto.randomUUID(),
        actor: 'ui',
      })
      toast.success('New encryption key created')
      fetchKeys()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleActivate = async (id: string) => {
    try {
      await api.activateSecurityKey(id)
      toast.success('Key activated')
      fetchKeys()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleReEncrypt = async () => {
    const activeKey = keys.find((k) => k.state === 'active')
    if (!activeKey) {
      toast.error('No active key found')
      return
    }
    try {
      await api.reencryptCredentials(activeKey.id)
      toast.success('Credentials re-encrypted')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleRetire = async (id: string) => {
    try {
      await api.retireSecurityKey(id)
      toast.success('Key retired')
      fetchKeys()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <PanelSection
      title="Encryption Keys"
      badge={<Badge variant="outline" className="text-[10px] h-4">{keys.length}</Badge>}
    >
      {keys.length > 0 ? (
        <div className="space-y-1.5">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/20 group">
              {k.state === 'active' ? (
                <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium font-mono truncate">{k.id.slice(0, 12)}…</p>
                <p className="text-[9px] text-muted-foreground capitalize">{k.state}</p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                {k.state !== 'active' && k.state !== 'retired' && (
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleActivate(k.id)} title="Activate">
                    <Check className="h-3 w-3 text-emerald-400" />
                  </Button>
                )}
                {k.state !== 'retired' && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => handleRetire(k.id)} title="Retire">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/60 py-2">No encryption keys</p>
      )}

      <div className="flex gap-1.5 mt-2">
        <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={handleCreate}>
          <Plus className="h-3 w-3 mr-1" /> New Key
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={handleReEncrypt} disabled={keys.length === 0}>
          <RotateCw className="h-3 w-3 mr-1" /> Re-encrypt
        </Button>
      </div>
    </PanelSection>
  )
}

/* ── Orchestration Profiles Section ── */
function OrchestrationProfilesSection() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newConfig, setNewConfig] = useState('{\n  "join_policy": "quorum",\n  "router_strategy": "round_robin"\n}')

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listOrchestrationProfiles()
      setProfiles(data.profiles)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  const handleCreate = async () => {
    try {
      const config = JSON.parse(newConfig)
      await api.createOrchestrationProfile({ name: newName, config })
      toast.success('Profile created')
      setShowCreate(false); setNewName('')
      fetchProfiles()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteOrchestrationProfile(id)
      toast.success('Profile deleted')
      fetchProfiles()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <PanelSection
      title="Orchestration Profiles"
      badge={<Badge variant="outline" className="text-[10px] h-4">{profiles.length}</Badge>}
    >
      {profiles.length > 0 ? (
        <div className="space-y-1.5">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/20 group">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{p.name}</p>
                <p className="text-[9px] text-muted-foreground font-mono">{p.config?.join_policy ?? '—'}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive opacity-0 group-hover:opacity-100 transition" onClick={() => handleDelete(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/60 py-2">No profiles</p>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-1.5 mt-2 p-2 rounded-lg border border-primary/20 bg-primary/5">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Profile name" className="h-7 text-xs" />
              <Textarea value={newConfig} onChange={(e) => setNewConfig(e.target.value)} rows={4} className="text-xs font-mono" />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleCreate} disabled={!newName}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button variant="outline" size="sm" className="h-6 text-[10px] w-full mt-2" onClick={() => setShowCreate(!showCreate)}>
        <Plus className="h-3 w-3 mr-1" /> New Profile
      </Button>
    </PanelSection>
  )
}

/* ── Pricing Profiles Section ── */
function PricingSection() {
  const [pricing, setPricing] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getPricingProfile().then(setPricing).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading && !pricing) return <PanelSection title="Pricing"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></PanelSection>
  if (!pricing) return null

  return (
    <PanelSection title="Pricing Profiles" description="Cost estimation models per provider">
      <div className="space-y-1.5">
        {pricing.models ? Object.entries(pricing.models).slice(0, 10).map(([model, data]: [string, any]) => (
          <div key={model} className="flex items-center justify-between text-[10px]">
            <span className="font-mono text-muted-foreground truncate flex-1">{model}</span>
            <div className="flex gap-2 font-mono">
              <span className="text-muted-foreground">in: ${data.input_cost_per_1k?.toFixed(4)}</span>
              <span className="text-muted-foreground">out: ${data.output_cost_per_1k?.toFixed(4)}</span>
            </div>
          </div>
        )) : (
          <p className="text-[10px] text-muted-foreground/60">No pricing data</p>
        )}
      </div>
    </PanelSection>
  )
}

/* ── Queue Stats Section ── */
function QueueStatsSection() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getQueueStats()
      setStats(data)
    } catch (e: any) { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (!stats) return null

  return (
    <PanelSection title="Queue Stats" badge={
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={fetchStats}>
        <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
      </Button>
    }>
      <div className="space-y-0.5">
        <MetricRow label="Backend" value={stats.backend} />
        <MetricRow label="Pending" value={stats.pending ?? 0} />
        <MetricRow label="In-flight" value={stats.in_flight ?? 0} />
        <MetricRow label="Completed" value={stats.completed ?? 0} />
        <MetricRow label="Failed" value={stats.failed ?? 0} />
        {stats.dlq_size != null && <MetricRow label="Dead Letter Queue" value={stats.dlq_size} />}
        {stats.workers && <MetricRow label="Workers" value={stats.workers} />}
      </div>
    </PanelSection>
  )
}

/* ── AFK Capabilities Section ── */
function CapabilitiesSection() {
  const { state } = useWorkspace()
  const caps = state.afkCapabilities

  if (!caps) return null

  return (
    <PanelSection title="AFK Capabilities" description="Available attack framework tools">
      <div className="space-y-1.5">
        {caps.tools?.map((t: any) => (
          <div key={t.name} className="flex items-start gap-2 text-[10px]">
            <Badge variant="outline" className="text-[9px] h-4 shrink-0 mt-0.5">{t.category ?? 'tool'}</Badge>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-muted-foreground line-clamp-1 text-[9px]">{t.description}</p>
            </div>
          </div>
        ))}
      </div>
    </PanelSection>
  )
}

/* ── Main Settings Panel ── */
export function SettingsPanel() {
  const { state, dispatch } = useWorkspace()
  const isOpen = state.activePanel === 'settings'

  return (
    <PanelShell
      open={isOpen}
      onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
      position="right"
      title="Settings"
      icon={<Settings2 className="h-4 w-4" />}
      width="w-[400px] lg:w-[440px]"
    >
      <CredentialsSection />
      <SecurityKeysSection />
      <OrchestrationProfilesSection />
      <PricingSection />
      <QueueStatsSection />
      <CapabilitiesSection />
    </PanelShell>
  )
}
