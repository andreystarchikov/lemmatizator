import { useMemo, useState } from 'react'
import stopwords from 'stopwords-iso'
import './App.css'

type LemmaCount = { lemma: string; count: number }
type BigramCount = { bigram: string; count: number }
type TrigramCount = { trigram: string; count: number }
type AnalyzeResponse = {
  language: 'en' | 'ru' | 'unknown'
  total_tokens: number
  unique_lemmas: number
  items: LemmaCount[]
  total_bigrams: number
  unique_bigrams: number
  bigrams: BigramCount[]
  total_trigrams: number
  unique_trigrams: number
  trigrams: TrigramCount[]
}

function App() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyzeResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'noStop' | 'withStop' | 'bigrams' | 'trigrams'>('noStop')
  const [copied, setCopied] = useState(false)

  const canAnalyze = useMemo(() => text.trim().length > 0 && !loading, [text, loading])

  async function analyze() {
    if (!canAnalyze) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const rawBase: string = ((import.meta as any).env?.VITE_API_BASE ?? '') as string
      const apiBase = rawBase.trim().replace(/\/+$/, '')

      const primaryUrl = apiBase ? `${apiBase}/api/analyze` : '/api/analyze'
      let res = await fetch(primaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok && apiBase) {
        // Fallback: try same-origin in case build arg was misconfigured
        const fallbackUrl = '/api/analyze'
        res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error((payload as any).detail || 'Request failed')
      }
      const json = (await res.json()) as AnalyzeResponse
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  const stopSet = useMemo(() => {
    if (!data) return new Set<string>()
    const dict: Record<string, string[]> = (stopwords as unknown as Record<string, string[]>)
    const langs = data.language === 'ru' ? ['ru'] : data.language === 'en' ? ['en'] : ['ru', 'en']
    const merged = langs.flatMap((l) => dict[l] || [])
    return new Set(merged.map((w) => w.toLowerCase()))
  }, [data?.language])

  const itemsNoStop = useMemo(() => {
    if (!data) return [] as LemmaCount[]
    if (stopSet.size === 0) return data.items
    return data.items.filter((it) => !stopSet.has(it.lemma))
  }, [data, stopSet])

  const itemsWithStop = data?.items ?? []

  const itemsToShow = activeTab === 'noStop' ? itemsNoStop : itemsWithStop

  async function copyActive() {
    if (!data) return
    let lines: string[] = []
    if (activeTab === 'noStop') {
      lines = itemsNoStop.map((it) => it.lemma)
    } else if (activeTab === 'withStop') {
      lines = itemsWithStop.map((it) => it.lemma)
    } else if (activeTab === 'bigrams') {
      lines = data.bigrams.map((b) => b.bigram)
    } else {
      lines = data.trigrams.map((t) => t.trigram)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">Лемматизатор</h1>
        <p className="subtitle">Вставьте текст и получите частотный словарь лемм</p>
      </header>

      <section className="panel">
        <textarea
          className="textarea"
          placeholder="Вставьте текст на русском..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
        />
        <div className="actions">
          <button className="btn primary" onClick={analyze} disabled={!canAnalyze}>
            {loading ? 'Лемматизирую…' : 'Лемматизировать'}
          </button>
          <button className="btn secondary" onClick={() => setText('')} disabled={loading || text.length === 0}>
            Очистить
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      {data && (
        <section className="results">
          <div className="meta">
            <span>Всего символов: {text.length}</span>
            <span>Уникальных лемм: {itemsNoStop.length}</span>
            
          </div>
          <div className="tabs-row">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'noStop' ? 'active' : ''}`}
                onClick={() => setActiveTab('noStop')}
              >
                Без стоп-слов
              </button>
              <button
                className={`tab ${activeTab === 'withStop' ? 'active' : ''}`}
                onClick={() => setActiveTab('withStop')}
              >
                Со стоп-словами
              </button>
              <button
                className={`tab ${activeTab === 'bigrams' ? 'active' : ''}`}
                onClick={() => setActiveTab('bigrams')}
              >
                Биграммы
              </button>
              <button
                className={`tab ${activeTab === 'trigrams' ? 'active' : ''}`}
                onClick={() => setActiveTab('trigrams')}
              >
                Триграммы
              </button>
            </div>
            <div className="copy-group">
              <button className="btn small" onClick={copyActive}>Копировать</button>
              {copied && <span className="copied">Скопировано</span>}
            </div>
          </div>
          {activeTab === 'noStop' || activeTab === 'withStop' ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Лемма</th>
                    <th>Частота</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsToShow.map((it) => (
                    <tr key={it.lemma}>
                      <td>{it.lemma}</td>
                      <td className="num">{it.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'bigrams' ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Биграмма</th>
                    <th>Частота</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bigrams.map((bg) => (
                    <tr key={bg.bigram}>
                      <td>{bg.bigram}</td>
                      <td className="num">{bg.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Триграмма</th>
                    <th>Частота</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trigrams.map((tg) => (
                    <tr key={tg.trigram}>
                      <td>{tg.trigram}</td>
                      <td className="num">{tg.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <footer className="footer">© 2025</footer>
    </div>
  )
}

export default App
