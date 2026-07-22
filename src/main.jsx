import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { queryClientInstance } from '@/lib/query-client'
import { base44 } from '@/api/base44Client'

// LCP / CLS: start the two above-the-fold CMS fetches (hero + announcement bar)
// BEFORE first render instead of waiting for the components to mount. The hero
// <img> URL comes from the home_hero section, so every round-trip shaved off
// this discovery chain directly moves LCP earlier; having the announcement bar
// data ready sooner also avoids a late top-of-page insert (layout shift).
// Fire-and-forget: React Query dedups with the components' own useQuery calls
// (identical queryKey/queryFn semantics), and failures simply let the
// components' own queries retry as before.
const CMS_STALE = 60_000
queryClientInstance.prefetchQuery({
  queryKey: ['cms-section', 'home_hero'],
  queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_hero' }, 'sort_order', 1),
  staleTime: CMS_STALE,
})
queryClientInstance.prefetchQuery({
  queryKey: ['cms-section', 'announcement_bar'],
  queryFn: () => base44.entities.CmsSection.filter({ section_key: 'announcement_bar' }, 'sort_order', 1),
  staleTime: CMS_STALE,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
