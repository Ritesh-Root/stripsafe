import { Theme } from '@astryxdesign/core/theme'
import { useEffect, useMemo, useState } from 'react'

import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { themes } from '../astryx-themes'
import { Shell, type Tab } from './components/Shell'
import { AlertsProvider, useAlerts } from './lib/AlertsContext'
import { assessCabinetItem, cabinetItemFromDraft, loadCabinet, saveCabinet } from './lib/cabinet'
import { matchBatch, type MatchOutcome } from './lib/match'
import { readStrip } from './lib/ocr'
import { parseStrip, unsureIndexes } from './lib/parse'
import type { CabinetItem, Draft } from './lib/types'
import { clearHeadline, flaggedHeadline } from './lib/wording'
import { labelMonth } from './lib/normalize'
import { AlertsScreen } from './screens/AlertsScreen'
import { CabinetScreen } from './screens/CabinetScreen'
import { ChemistScreen } from './screens/ChemistScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { ScanScreen } from './screens/ScanScreen'

type Route =
  | { name: 'home' | 'scan' | 'review' | 'result' | 'cabinet' | 'alerts' | 'chemist' }
  | { name: 'alert'; id: string }

const EMPTY: Draft = {
  product: '', brand: '', batch: '', manufacturer: '', mfg: '', exp: '',
  imageUrl: '', ocrText: '', unsureIndexes: [],
}

function initialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('stripsafe.theme')
  if (stored === 'light' || stored === 'dark') return stored
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('alert/')) return { name: 'alert', id: decodeURIComponent(path.slice(6)) }
  if (path === 'scan' || path === 'review' || path === 'result' || path === 'cabinet' || path === 'alerts' || path === 'chemist') {
    return { name: path }
  }
  return { name: 'home' }
}

function hashFor(route: Route): string {
  if (route.name === 'home') return '#/'
  if (route.name === 'alert') return `#/alert/${encodeURIComponent(route.id)}`
  return `#/${route.name}`
}

export function App() {
  return (
    <AlertsProvider>
      <AppFrame />
    </AlertsProvider>
  )
}

function AppFrame() {
  const alerts = useAlerts()
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null)
  const [newly, setNewly] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [items, setItems] = useState<CabinetItem[]>([])
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('stripsafe.theme', theme)
  }, [theme])

  useEffect(() => {
    if (alerts.status !== 'ready' || !alerts.index) return
    const index = alerts.index
    let cancel = false
    loadCabinet().then((loaded) => {
      const next = loaded.map((item) => assessCabinetItem(item, index))
      if (cancel) return
      setItems(next)
      setReady(true)
      if (JSON.stringify(next) !== JSON.stringify(loaded)) void saveCabinet(next)
    }).catch(() => setReady(true))
    return () => { cancel = true }
  }, [alerts.status, alerts.index])

  useEffect(() => {
    const hash = hashFor(route)
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
  }, [route])

  useEffect(() => {
    const onPop = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    document.getElementById('main')?.focus()
  }, [route])

  const tab: Tab | null = route.name === 'home' || route.name === 'cabinet' || route.name === 'alerts' || route.name === 'chemist'
    ? (route.name === 'home' ? 'home' : route.name)
    : null

  const title = useMemo(() => {
    if (route.name === 'scan') return 'Scan a strip'
    if (route.name === 'review') return 'Check what we read'
    if (route.name === 'result' || route.name === 'alert') return 'Result'
    return undefined
  }, [route])

  function goTab(next: Tab) {
    setRoute({ name: next === 'home' ? 'home' : next })
  }

  function back() {
    if (route.name === 'review' || route.name === 'result' || route.name === 'alert' || route.name === 'scan') {
      setRoute({ name: 'home' })
    }
  }

  async function onImage(file: Blob, label: string) {
    setBusy(true)
    const imageUrl = URL.createObjectURL(file)
    try {
      const read = await readStrip(file)
      const parsed = parseStrip(read.text || label)
      const batch = parsed.batch
      setDraft({
        ...parsed,
        imageUrl,
        ocrText: read.text.trim() || label,
        unsureIndexes: unsureIndexes(batch, read.glyphs),
      })
    } catch {
      setDraft({ ...EMPTY, imageUrl, ocrText: 'The reader could not run. Type the batch from the strip.' })
    } finally {
      setBusy(false)
      setSavedId(null)
      setNewly(false)
      setRoute({ name: 'review' })
    }
  }

  function checkDraft(next = draft) {
    if (!alerts.index) return
    const result = matchBatch({
      batch: next.batch,
      product: next.product,
      brand: next.brand,
      manufacturer: next.manufacturer,
    }, alerts.index)
    setOutcome(result)
    setNewly(false)
    setSavedId(null)
    setRoute({ name: 'result' })
  }

  async function saveCurrent(source: Draft = draft, result: MatchOutcome | null = outcome) {
    if (!result) return
    const alertIds = result.hit ? [result.hit.alert.id] : []
    const item = cabinetItemFromDraft(source, result.status, alertIds)
    const next = [item, ...items.filter((existing) => existing.id !== item.id)]
    setItems(next)
    setSavedId(item.id)
    await saveCabinet(next)
  }

  function openItem(item: CabinetItem) {
    const nextDraft: Draft = {
      product: item.product,
      brand: item.brand,
      batch: item.batch,
      manufacturer: item.manufacturer,
      mfg: item.mfg,
      exp: item.exp,
      imageUrl: '',
      ocrText: '',
      unsureIndexes: [],
    }
    if (!alerts.index) return
    const result = matchBatch({
      batch: item.batch,
      product: item.product,
      brand: item.brand,
      manufacturer: item.manufacturer,
    }, alerts.index)
    setDraft(nextDraft)
    setOutcome(result)
    setNewly(item.newlyFlagged)
    setSavedId(item.id)
    setRoute(result.status === 'flagged' ? { name: 'alert', id: item.id } : { name: 'result' })
  }

  async function share() {
    if (!outcome) return
    const month = outcome.hit ? labelMonth(outcome.hit.alert.month) : ''
    const text = outcome.status === 'flagged'
      ? `${flaggedHeadline(month)}. Batch ${draft.batch}. ${outcome.hit?.alert.result ?? ''}`.trim()
      : `${clearHeadline()}. Batch ${draft.batch}.`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'StripSafe', text })
        return
      } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(text)
  }

  const activeItem = route.name === 'alert' ? items.find((item) => item.id === route.id) : undefined
  const viewDraft: Draft = activeItem
    ? {
        product: activeItem.product,
        brand: activeItem.brand,
        batch: activeItem.batch,
        manufacturer: activeItem.manufacturer,
        mfg: activeItem.mfg,
        exp: activeItem.exp,
        imageUrl: '',
        ocrText: '',
        unsureIndexes: [],
      }
    : draft
  const viewOutcome = activeItem && alerts.index
    ? matchBatch({
        batch: activeItem.batch,
        product: activeItem.product,
        brand: activeItem.brand,
        manufacturer: activeItem.manufacturer,
      }, alerts.index)
    : outcome

  return (
    <Theme theme={themes.neutral} mode={theme}>
      <Shell
        tab={tab}
        title={title}
        onBack={title ? back : undefined}
        onTab={goTab}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      >
        {alerts.status === 'loading' ? (
          <p className="supporting" role="status">Loading the CDSCO list…</p>
        ) : null}
        {alerts.status === 'error' ? (
          <>
            <Banner status="warning" title="CDSCO list didn't load" description={alerts.message} collapsible={false} />
            <Button label="Try again" variant="secondary" width="100%" onClick={alerts.reload} />
          </>
        ) : null}
        {route.name === 'home' ? (
          <HomeScreen
            theme={theme}
            onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            items={items}
            onScan={() => setRoute({ name: 'scan' })}
            onType={() => { setDraft(EMPTY); setSavedId(null); setRoute({ name: 'review' }) }}
            onOpen={openItem}
          />
        ) : null}
        {route.name === 'scan' ? <ScanScreen onBack={back} onImage={(file, label) => void onImage(file, label)} busy={busy} /> : null}
        {route.name === 'review' ? (
          <ReviewScreen draft={draft} onChange={setDraft} onCheck={() => checkDraft()} />
        ) : null}
        {(route.name === 'result' || route.name === 'alert') && viewOutcome ? (
          <ResultScreen
            draft={viewDraft}
            outcome={viewOutcome}
            newly={newly || Boolean(activeItem?.newlyFlagged)}
            saved={savedId !== null}
            onSave={() => void saveCurrent(viewDraft, viewOutcome)}
            onScanAnother={() => setRoute({ name: 'scan' })}
            onShare={() => void share()}
          />
        ) : null}
        {route.name === 'cabinet' ? <CabinetScreen items={items} theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onOpen={openItem} /> : null}
        {route.name === 'alerts' ? <AlertsScreen items={items} theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onOpen={openItem} /> : null}
        {route.name === 'chemist' ? <ChemistScreen theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} /> : null}
        {route.name === 'alert' && !activeItem && ready ? (
          <p className="supporting">That cabinet entry is not on this phone.</p>
        ) : null}
      </Shell>
    </Theme>
  )
}
