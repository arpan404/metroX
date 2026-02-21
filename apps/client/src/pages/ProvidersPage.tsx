import { useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api'
import type { ProviderCredential, ProviderValidation, SecretKey, SecretKeyEvent } from '../lib/types'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

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
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

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
    setError(null)
    setStatus(null)
    if (!keyMaterial.trim()) {
      setError('Key material is required')
      return
    }
    try {
      await api.createSecurityKey({ version: keyVersion, key_material: keyMaterial, actor: 'ui' })
      setStatus(`Created key ${keyVersion}`)
      setKeyMaterial('')
      await loadAll()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create key')
    }
  }

  async function activateKey() {
    if (!selectedKeyId) return
    setError(null)
    setStatus(null)
    try {
      await api.activateSecurityKey(selectedKeyId)
      setStatus('Key activated')
      await loadAll()
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : 'Failed to activate key')
    }
  }

  async function reencryptKey() {
    if (!selectedKeyId) return
    setError(null)
    setStatus(null)
    try {
      const out = await api.reencryptCredentials(selectedKeyId)
      setStatus(`Re-encrypted ${out.updated}/${out.total} credentials`)
      await loadAll()
    } catch (reencryptError) {
      setError(reencryptError instanceof Error ? reencryptError.message : 'Failed to re-encrypt credentials')
    }
  }

  async function retireKey() {
    if (!selectedKeyId) return
    setError(null)
    setStatus(null)
    try {
      await api.retireSecurityKey(selectedKeyId)
      setStatus('Key retired')
      await loadAll()
    } catch (retireError) {
      setError(retireError instanceof Error ? retireError.message : 'Failed to retire key')
    }
  }

  async function createCredential() {
    if (!apiKey.trim()) {
      setError('API key is required')
      return
    }
    setError(null)
    setStatus(null)
    try {
      const created = await api.createProviderCredential({
        name: credentialName,
        provider_type: providerType,
        api_key: apiKey,
        status: 'active',
      })
      setApiKey('')
      setSelectedCredentialId(created.id)
      setStatus('Credential created')
      await loadAll()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create credential')
    }
  }

  async function rotateCredential() {
    if (!selectedCredentialId || !apiKey.trim()) {
      setError('Select credential and provide new API key')
      return
    }
    setError(null)
    setStatus(null)
    try {
      await api.rotateProviderCredential(selectedCredentialId, { api_key: apiKey, key_version: keyVersion })
      setApiKey('')
      setStatus('Credential rotated')
      await loadAll()
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : 'Failed to rotate credential')
    }
  }

  async function validateProvider() {
    setError(null)
    setStatus(null)
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
      setStatus(out.valid ? 'Validation succeeded' : 'Validation failed')
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Provider validation failed')
    }
  }

  return (
    <Tabs defaultValue="credentials" className="space-y-4">
      <TabsList>
        <TabsTrigger value="credentials">Credentials</TabsTrigger>
        <TabsTrigger value="keys">Key Lifecycle</TabsTrigger>
        <TabsTrigger value="validation">Validation</TabsTrigger>
      </TabsList>

      <TabsContent value="credentials" className="space-y-4">
        <Card>
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
      </TabsContent>

      <TabsContent value="keys" className="space-y-4">
        <Card>
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
      </TabsContent>

      <TabsContent value="validation" className="space-y-4">
        <Card>
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
                <p>Status: {validation.valid ? 'valid' : 'invalid'}</p>
                <p>Confidence: {(validation.capability_confidence ?? 0).toFixed(2)}</p>
                <p>Discovery: {validation.model_discovery_mode ?? 'inferred'}</p>
                <p>Error Class: {validation.error_class ?? 'none'}</p>
                <div className="space-y-1">
                  {validation.probe_results?.map((probe) => (
                    <p key={`${probe.probe}-${probe.status}`}>{probe.probe}: {probe.status} ({Math.round(probe.latency_ms)}ms)</p>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      {status ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{status}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </Tabs>
  )
}
