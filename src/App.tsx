import { useEffect, useMemo, useState } from 'react'

type WebhookTimestamp = string | { $date: string }

type WebhookRecord = {
  _id: { $oid: string }
  request_id: string
  author: string
  action: string
  from_branch?: string | null
  to_branch?: string | null
  timestamp: WebhookTimestamp
}

type ApiResponse = {
  success: boolean
  records: WebhookRecord[]
  total_records: number
  page: number
  per_page: number
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

function resolveTimestamp(timestamp: WebhookTimestamp): string {
  if (typeof timestamp === 'string') {
    return timestamp
  }

  if (timestamp && typeof timestamp === 'object' && '$date' in timestamp) {
    return (timestamp as { $date: string }).$date
  }

  return String(timestamp ?? '')
}

function buildDescription(record: WebhookRecord): string {
  const author = `"${record.author}"`
  const fromBranch = record.from_branch ? `"${record.from_branch}"` : '""'
  const toBranch = record.to_branch ? `"${record.to_branch}"` : '""'
  const ts = resolveTimestamp(record.timestamp)

  const action = record.action?.toLowerCase()

  if (action === 'push') {
    return `${author} pushed to ${toBranch} on ${ts}`
  }

  if (action === 'opened' || action === 'pull_request') {
    return `${author} submitted a pull request from ${fromBranch} to ${toBranch} on ${ts}`
  }

  if (action === 'closed' || action === 'merge' || action === 'merged') {
    return `${author} merged branch ${fromBranch} to ${toBranch} on ${ts}`
  }

  // Fallback for any other actions
  return `${author} performed ${record.action} on ${ts}`
}

function getItemColor(action: string): string {
  const a = action.toLowerCase()

  if (a === 'push') return 'bg-blue-50'
  if (a === 'opened' || a === 'pull_request') return 'bg-yellow-50'
  if (a === 'closed' || a === 'merge' || a === 'merged') return 'bg-green-50'

  return 'bg-slate-50'
}

function App() {
  const [records, setRecords] = useState<WebhookRecord[]>([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(15)
  const [totalRecords, setTotalRecords] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPages = useMemo(
    () => (totalRecords > 0 ? Math.ceil(totalRecords / perPage) : 1),
    [totalRecords, perPage],
  )

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const url = new URL(`${API_BASE_URL}/webhook/data`)
        url.searchParams.set('page', String(page))
        url.searchParams.set('per_page', String(perPage))

        const res = await fetch(url.toString())

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`)
        }

        const data: ApiResponse = await res.json()

        if (cancelled) return

        if (!data.success) {
          throw new Error('API returned success = false')
        }

        setRecords(data.records ?? [])
        setTotalRecords(data.total_records ?? 0)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    // Initial load
    fetchData()

    // Poll every 15 seconds
    const intervalId = window.setInterval(() => {
      void fetchData()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [page, perPage])

  const handlePrev = () => {
    setPage((current) => Math.max(1, current - 1))
  }

  const handleNext = () => {
    setPage((current) => Math.min(totalPages, current + 1))
  }

  const handlePerPageChange: React.ChangeEventHandler<HTMLSelectElement> = (
    event,
  ) => {
    const value = Number(event.target.value) || 15
    setPerPage(value)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Webhook Activity
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            A minimal view of recent webhook events.
          </p>
        </header>

        <section className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            {totalRecords > 0 ? (
              <>
                Showing page <span className="font-medium">{page}</span> of{' '}
                <span className="font-medium">{totalPages}</span> &middot;{' '}
                <span className="font-medium">{totalRecords}</span> total
                records
              </>
            ) : (
              'No records yet.'
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="per-page" className="text-slate-600">
              Page size:
            </label>
            <select
              id="per-page"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={perPage}
              onChange={handlePerPageChange}
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
            </select>
          </div>
        </section>

        <main className="space-y-3">
          {loading && (
            <div className="rounded-md bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              Loading records…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && records.length === 0 && (
            <div className="rounded-md bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              No webhook events to display.
            </div>
          )}

          <ul className="space-y-2">
            {!loading &&
              !error &&
              records.map((record) => (
                <li
                  key={record._id?.$oid ?? record.request_id}
                  className={`${getItemColor(
                    record.action,
                  )} rounded-md px-4 py-3 text-sm text-slate-800 shadow-sm`}
                >
                  <p>{buildDescription(record)}</p>
                  {/* <p className="mt-1 text-xs text-slate-500">
                    Request ID: {record.request_id}
                  </p> */}
                </li>
              ))}
          </ul>
        </main>

        <footer className="mt-6 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={page <= 1 || loading}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-700">
              Page <span className="font-medium">{page}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={page >= totalPages || loading || totalRecords === 0}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
