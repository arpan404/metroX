import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { ProviderCredential, ProviderValidation, SecretKey, SecretKeyEvent } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function formatTime(value?: string | null): string {
  if (!value) return 'n/a'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function ProvidersPage() {
  const [credentials, setCredentials] = useState<ProviderCredential[]>([])
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [providerType, setProviderType] = useState<'managed_llm_runtime' | 'openai_compatible'>('managed_llm_runtime')
  const [credentialName, setCredentialName] = useState('provider-key-main')
  const [apiKey, setApiKey] = useState('')
  const [keyVersion, setKeyVersion] = useState('v1')

  const [secretKeys, setSecretKeys] = useState<SecretKey[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [keyMaterial, setKeyMaterial] = useState('')
  const [keyEvents, setKeyEvents] = useState<SecretKeyEvent[]>([])

  const [model, setModel] = useState('gpt-4.1-mini')
  const [baseUrl, setBaseUrl] = useState('')
  const [validation, setValidation] = useState<ProviderValidation | null>(null)

  const [busy, setBusy] = useState(false)

  const selectedCredential = useMemo(
    () => credentials.find((row) => row.id === selectedCredentialId) ?? null,
    [credentials, selectedCredentialId],
  )

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

  useEffect(() => {
    void loadAll()
  }, [])

  async function createKey() {
    if (!keyMaterial.trim()) {
      toast.error('Key material is required')
      return
    }
    try {
      await api.createSecurityKey({ version: keyVersion, key_material: keyMaterial, actor: 'ui' })
      toast.success(`Created key ${keyVersion}`)
      setKeyMaterial('')
      await loadAll()
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Failed to create key')
    }
  }

  async function activateKey() {
    if (!selectedKeyId) return
    try {
      await api.activateSecurityKey(selectedKeyId)
      toast.success('Key activated')
      await loadAll()
    } catch (activateError) {
      toast.error(activateError instanceof Error ? activateError.message : 'Failed to activate key')
    }
  }

  async function reencryptKey() {
    if (!selectedKeyId) return
    try {
      const out = await api.reencryptCredentials(selectedKeyId)
      toast.success(`Re-encrypted ${out.updated}/${out.total} credentials`)
      await loadAll()
    } catch (reencryptError) {
      toast.error(reencryptError instanceof Error ? reencryptError.message : 'Failed to re-encrypt credentials')
    }
  }

  async function retireKey() {
    if (!selectedKeyId) return
    try {
      await api.retireSecurityKey(selectedKeyId)
      toast.success('Key retired')
      await loadAll()
    } catch (retireError) {
      toast.error(retireError instanceof Error ? retireError.message : 'Failed to retire key')
    }
  }

  async function createCredential() {
    if (!apiKey.trim()) {
      toast.error('API key is required')
      return
    }
    try {
      const created = await api.createProviderCredential({
        name: credentialName,
        provider_type: providerType,
        api_key: apiKey,
        status: 'active',
      })
      setApiKey('')
      setSelectedCredentialId(created.id)
      toast.success('Credential created')
      await loadAll()
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Failed to create credential')
    }
  }

  async function rotateCredential() {
    if (!selectedCredentialId || !apiKey.trim()) {
      toast.error('Select credential and provide new API key')
      return
    }
    try {
      await api.rotateProviderCredential(selectedCredentialId, { api_key: apiKey, key_version: keyVersion })
      setApiKey('')
      toast.success('Credential rotated')
      await loadAll()
    } catch (rotateError) {
      toast.error(rotateError instanceof Error ? rotateError.message : 'Failed to rotate credential')
    }
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
      if (out.valid) {
        toast.success('Validation succeeded')
      } else {
        toast.error('Validation failed')
      }
    } catch (validationError) {
      toast.error(validationError instanceof Error ? validationError.message : 'Provider validation failed')
    }
  }

  return (
    <div className="absolute inset-0 overflow-y-auto pt-20 pb-8 px-4 md:px-8">
      <div className="mx-auto max-w-4xl">
        <Tabs defaultValue="credentials" className="space-y-4">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <TabsList className="rounded-full">
              <TabsTrigger value="credentials">Credentials</TabsTrigger>
              <TabsTrigger value="keys">Key Lifecycle</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
            </TabsList>
          </motion.div>

          <TabsContent value="credentials" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/90 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle>Credential Registry</CardTitle>
                  <CardDescription>Encrypted provider credentials bound to active local key version.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Validated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {credentials.map((row) => (
                          <TableRow key={row.id} onClick={() => setSelectedCredentialId(row.id)} className="cursor-pointer">
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.provider_type}</TableCell>
                            <TableCell>{row.key_version}</TableCell>
                            <TableCell>{row.status}</TableCell>
                            <TableCell>{formatTime(row.last_validated_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Provider Type</Label>
                      <Select value={providerType} onValueChange={(value) => setProviderType(value as 'managed_llm_runtime' | 'openai_compatible')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="managed_llm_runtime">managed_llm_runtime</SelectItem>
                          <SelectItem value="openai_compatible">openai_compatible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Credential Name</Label>
                      <Input value={credentialName} onChange={(event) => setCredentialName(event.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>API Key</Label>
                      <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={createCredential}>Create Credential</Button>
                    <Button variant="secondary" onClick={rotateCredential}>Rotate Selected</Button>
                    <Button variant="outline" onClick={loadAll} disabled={busy}>Refresh</Button>
                  </div>
                  {selectedCredential ? <p className="text-sm text-muted-foreground">Selected: {selectedCredential.name}</p> : null}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="keys" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/90 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle>Secret Key Lifecycle</CardTitle>
                  <CardDescription>Create, activate, re-encrypt credentials, and retire local DB keys.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2"><Label>Version</Label><Input value={keyVersion} onChange={(event) => setKeyVersion(event.target.value)} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Key Material</Label><Input type="password" value={keyMaterial} onChange={(event) => setKeyMaterial(event.target.value)} /></div>
                  </div>
                  <div className="flex gap-2"><Button onClick={createKey}>Create Key</Button></div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Activated</TableHead>
                          <TableHead>Retired</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {secretKeys.map((row) => (
                          <TableRow key={row.id} onClick={() => setSelectedKeyId(row.id)} className="cursor-pointer">
                            <TableCell>{row.version}</TableCell>
                            <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                            <TableCell>{formatTime(row.activated_at)}</TableCell>
                            <TableCell>{formatTime(row.retired_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={activateKey} disabled={!selectedKeyId}>Activate</Button>
                    <Button variant="secondary" onClick={reencryptKey} disabled={!selectedKeyId}>Re-encrypt Credentials</Button>
                    <Button variant="outline" onClick={retireKey} disabled={!selectedKeyId}>Retire</Button>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {keyEvents.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell>{event.action}</TableCell>
                            <TableCell>{event.actor}</TableCell>
                            <TableCell>{formatTime(event.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="validation" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
              <Card className="bg-card/90 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle>Provider Validation</CardTitle>
                  <CardDescription>Multi-probe validation with capability confidence and normalized errors.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Model</Label><Input value={model} onChange={(event) => setModel(event.target.value)} /></div>
                    <div className="space-y-2"><Label>Base URL (openai_compatible)</Label><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api..." /></div>
                  </div>
                  <Button onClick={validateProvider}>Validate</Button>

                  {validation ? (
                    <div className="space-y-2 rounded-md border p-4 text-sm">
                      <p>Status: <Badge variant={validation.valid ? 'default' : 'destructive'}>{validation.valid ? 'valid' : 'invalid'}</Badge></p>
                      <p>Confidence: {(validation.capability_confidence ?? 0).toFixed(2)}</p>
                      <p>Discovery: {validation.model_discovery_mode ?? 'inferred'}</p>
                      <p>Error Class: {validation.error_class ?? 'none'}</p>
                      <div className="space-y-1">
                        {validation.probe_results?.map((probe) => (
                          <p key={`${probe.probe}-${probe.status}`} className="font-mono text-xs">{probe.probe}: {probe.status} ({Math.round(probe.latency_ms)}ms)</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
