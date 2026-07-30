import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { COUNTRIES, findCountry, DEFAULT_COUNTRY } from '@/lib/countryCodes';

// Common shorthand people actually type when searching a dial code.
const ALIASES = {
  uae: 'AE', emirates: 'AE', dubai: 'AE',
  uk: 'GB', britain: 'GB', england: 'GB',
  usa: 'US', america: 'US', states: 'US',
  ksa: 'SA', saudi: 'SA',
  leb: 'LB', lebanon: 'LB', beirut: 'LB',
  q8: 'KW', kuwait: 'KW',
  ivory: 'CI', congo: 'CG', drc: 'CD',
  korea: 'KR', russia: 'RU', turkiye: 'TR', turkey: 'TR',
};

// Searchable country dial-code picker for checkout. Renders as the prefix of
// the phone input; the national number is validated per-country in
// src/lib/countryCodes.js.
export default function CountryCodeSelect({ value, onChange }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  const country = findCountry(value) || findCountry(DEFAULT_COUNTRY);
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  const aliasIsos = new Set(
    Object.entries(ALIASES).filter(([a]) => a.startsWith(q) || q.startsWith(a)).map(([, iso]) => iso)
  );
  const list = q
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(q) || c.iso.toLowerCase().includes(q) || c.dial.includes(q) || aliasIsos.has(c.iso))
    : COUNTRIES;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2.5 min-h-[44px] text-sm text-foreground border-r border-border"
        aria-label={t('Select country code', 'اختيار رمز الدولة')}
        dir="ltr"
      >
        <span className="font-medium">+{country.dial}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 start-0 z-50 w-64 max-w-[80vw] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search country or code…', 'ابحثي عن الدولة أو الرمز…')}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {list.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">{t('No countries found', 'لا توجد دول مطابقة')}</p>
            )}
            {list.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => { onChange(c.iso); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-start text-sm hover:bg-muted ${
                  c.iso === country.iso ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-muted-foreground shrink-0" dir="ltr">+{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
