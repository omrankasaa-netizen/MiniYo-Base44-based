import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { queryClientInstance } from '@/lib/query-client'
import { base44 } from '@/api/base44Client'

// Prime the shared homepage CMS query before first render so home components read
// from one cache entry instead of issuing per-section requests.
const CMS_STALE = 60_000
queryClientInstance.prefetchQuery({
  queryKey: ['cms-sections-all'],
  queryFn: () => base44.entities.CmsSection.filter({ is_active: true }, 'sort_order', 200),
  staleTime: CMS_STALE,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
