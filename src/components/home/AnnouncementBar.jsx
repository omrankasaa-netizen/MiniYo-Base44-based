import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function AnnouncementBar() {
  const { lang } = useLang();
  const [dismissed, setDismissed] = useState(false);

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'announcement_bar'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'announcement_bar' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  if (dismissed || !section?.is_active || (!section.title && !section.title_ar)) return null;
  const text = lang === 'ar' ? (section.title_ar || section.title) : section.title;
  // section.body stores the chosen color class
  const colorClass = section.body || 'bg-primary text-primary-foreground';

  const textEl = section.link_url
    ? <a href={section.link_url} className="underline underline-offset-2 hover:opacity-80">{text}</a>
    : <span>{text}</span>;

  return (
    <div className={`${colorClass} text-center text-xs py-2 px-10 font-body relative`}>
      {textEl}
      <button onClick={() => setDismissed(true)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}