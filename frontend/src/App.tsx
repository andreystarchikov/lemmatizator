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
  items_filtered: LemmaCount[]
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
  const [countSortDesc, setCountSortDesc] = useState(true)

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
    // Prefer backend-filtered if provided
    if (data.items_filtered && data.items_filtered.length > 0) return data.items_filtered
    if (stopSet.size === 0) return data.items
    return data.items.filter((it) => !stopSet.has(it.lemma))
  }, [data, stopSet])

  const itemsWithStop = data?.items ?? []

  // kept for clarity previously; replaced by derived sorted rows

  const unigramRows = useMemo(() => {
    const source = activeTab === 'noStop' ? itemsNoStop : itemsWithStop
    const sorted = [...source].sort((a, b) => (countSortDesc ? b.count - a.count : a.count - b.count))
    return sorted
  }, [activeTab, itemsNoStop, itemsWithStop, countSortDesc])

  const bigramRows = useMemo(() => {
    if (!data) return [] as BigramCount[]
    return [...data.bigrams].sort((a, b) => (countSortDesc ? b.count - a.count : a.count - b.count))
  }, [data?.bigrams, countSortDesc])

  const trigramRows = useMemo(() => {
    if (!data) return [] as TrigramCount[]
    return [...data.trigrams].sort((a, b) => (countSortDesc ? b.count - a.count : a.count - b.count))
  }, [data?.trigrams, countSortDesc])

  function toggleCountSort() {
    setCountSortDesc((v) => !v)
  }

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

  function downloadActiveCsv() {
    if (!data) return

    let header: string[] = []
    let rows: string[][] = []
    let filename = 'data.csv'

    if (activeTab === 'noStop') {
      header = ['Лемма', 'Частота']
      rows = unigramRows.map((it) => [it.lemma, String(it.count)])
      filename = 'unigrams-no-stop.csv'
    } else if (activeTab === 'withStop') {
      header = ['Лемма', 'Частота']
      rows = unigramRows.map((it) => [it.lemma, String(it.count)])
      filename = 'unigrams-with-stop.csv'
    } else if (activeTab === 'bigrams') {
      header = ['Биграмма', 'Частота']
      rows = bigramRows.map((b) => [b.bigram, String(b.count)])
      filename = 'bigrams.csv'
    } else {
      header = ['Триграмма', 'Частота']
      rows = trigramRows.map((t) => [t.trigram, String(t.count)])
      filename = 'trigrams.csv'
    }

    const csvEscape = (value: string) => {
      if (value == null) return ''
      const needsQuote = /[",\n\r]/.test(value)
      const out = value.replace(/"/g, '""')
      return needsQuote ? `"${out}"` : out
    }

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map((r) => r.map(csvEscape).join(',')),
    ]

    const csvBody = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">Лемматизатор</h1>
        <p className="subtitle">Помогает разбить текст на n-граммы</p>
      </header>

      <section className="panel">
        <textarea
          className="textarea"
          placeholder="Вставьте текст..."
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
              <button className="btn small" onClick={downloadActiveCsv}>Скачать .csv</button>
              {copied && <span className="copied">Скопировано</span>}
            </div>
          </div>
          {activeTab === 'noStop' || activeTab === 'withStop' ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Лемма</th>
                    <th className="th-sortable" onClick={toggleCountSort}>
                      Частота <span className="sort-ind">{countSortDesc ? '↓' : '↑'}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {unigramRows.map((it) => (
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
                    <th className="th-sortable" onClick={toggleCountSort}>
                      Частота <span className="sort-ind">{countSortDesc ? '↓' : '↑'}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bigramRows.map((row) => (
                    <tr key={row.bigram}>
                      <td>{row.bigram}</td>
                      <td className="num">{row.count}</td>
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
                    <th className="th-sortable" onClick={toggleCountSort}>
                      Частота <span className="sort-ind">{countSortDesc ? '↓' : '↑'}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trigramRows.map((row) => (
                    <tr key={row.trigram}>
                      <td>{row.trigram}</td>
                      <td className="num">{row.count}</td>
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
