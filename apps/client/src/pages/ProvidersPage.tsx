import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { ProviderCredential, ProviderValidation } from '../lib/types'

type ProviderType = 'synthetic' | 'litellm' | 'openai_compatible' | 'afk_agent'

function formatTime(value?: string | null): string {
  if (!value) return 'n/a'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function ProvidersPage() {
  const [credentials, setCredentials] = useState<ProviderCredential[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [providerType, setProviderType] = useState<ProviderType>('openai_compatible')
  const [credentialName, setCredentialName] = useState('provider-key-main')
  const [apiKey, setApiKey] = useState('')
  const [keyVersion, setKeyVersion] = useState('v1')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [validation, setValidation] = useState<ProviderValidation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => credentials.find((row) => row.id === selectedId) ?? null,
    [credentials, selectedId],
  )

  async function loadCredentials() {
    setBusy(true)
    setError(null)
    try {
      const payload = await api.listProviderCredentials()
      setCredentials(payload.credentials)
      if (!selectedId && payload.credentials.length > 0) {
        setSelectedId(payload.credentials[0].id)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load credentials')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void loadCredentials()
  }, [])

  async function createCredential() {
    if (!apiKey) {
      setError('API key is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.createProviderCredential({
        name: credentialName,
        provider_type: providerType,
        api_key: apiKey,
        status: 'active',
      })
      await loadCredentials()
      setSelectedId(created.id)
      setApiKey('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create credential')
    } finally {
      setBusy(false)
    }
  }

  async function rotateCredential() {
    if (!selectedId) {
      setError('Select a credential first')
      return
    }
    if (!apiKey) {
      setError('New API key is required for rotation')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.rotateProviderCredential(selectedId, {
        api_key: apiKey,
        key_version: keyVersion || undefined,
      })
      await loadCredentials()
      setApiKey('')
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : 'Failed to rotate credential')
    } finally {
      setBusy(false)
    }
  }

  async function validateProvider() {
    setBusy(true)
    setError(null)
    setValidation(null)
    try {
      const payload = await api.validateProvider({
        provider_type: providerType,
        model: model || undefined,
        base_url: baseUrl || undefined,
        credential_id: selectedId || undefined,
        api_key: !selectedId ? apiKey || undefined : undefined,
      })
      setValidation(payload)
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : 'Failed to validate provider')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack-lg">
      <div className="panel stack-md">
        <div className="row between wrap">
          <h2>Provider Credentials</h2>
          <button type="button" className="ghost" disabled={busy} onClick={loadCredentials}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Version</th>
                <th>Status</th>
                <th>Last Validated</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((row) => (
                <tr
                  key={row.id}
                  className={row.id === selectedId ? 'table-row-active' : ''}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td>{row.name}</td>
                  <td>{row.provider_type}</td>
                  <td>{row.key_version}</td>
                  <td>{row.status}</td>
                  <td>{formatTime(row.last_validated_at)}</td>
                  <td>{formatTime(row.created_at)}</td>
                </tr>
              ))}
              {credentials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="caption">
                    No credentials saved.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two">
        <div className="panel stack-md">
          <h2>Create / Rotate</h2>
          <label>
            Provider Type
            <select value={providerType} onChange={(event) => setProviderType(event.target.value as ProviderType)}>
              <option value="openai_compatible">openai_compatible</option>
              <option value="litellm">litellm</option>
              <option value="afk_agent">afk_agent</option>
              <option value="synthetic">synthetic</option>
            </select>
          </label>
          <label>
            Credential Name
            <input value={credentialName} onChange={(event) => setCredentialName(event.target.value)} />
          </label>
          <label>
            Key Version
            <input value={keyVersion} onChange={(event) => setKeyVersion(event.target.value)} placeholder="v1" />
          </label>
          <label>
            API Key (write-only)
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
          </label>
          <div className="row gap-lg wrap">
            <button type="button" className="primary" disabled={busy} onClick={createCredential}>
              Create Credential
            </button>
            <button type="button" className="ghost" disabled={busy || !selectedId} onClick={rotateCredential}>
              Rotate Selected
            </button>
          </div>
          <p className="caption">Selected ID: {selectedId || 'none'}</p>
          {selected ? (
            <p className="caption">
              Selected: {selected.name} ({selected.provider_type}/{selected.key_version})
            </p>
          ) : null}
        </div>

        <div className="panel stack-md">
          <h2>Validation</h2>
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label>
            Base URL (for openai_compatible)
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <button type="button" className="primary" disabled={busy} onClick={validateProvider}>
            Validate Provider
          </button>
          {validation ? (
            <div className="callout">
              <p>Status: {validation.valid ? 'valid' : 'invalid'}</p>
              {validation.error ? <p>Error: {validation.error}</p> : null}
              {validation.discovered_models?.length ? (
                <p>Discovered Models: {validation.discovered_models.slice(0, 5).join(', ')}</p>
              ) : null}
            </div>
          ) : (
            <p className="caption">Validation report appears here.</p>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}
