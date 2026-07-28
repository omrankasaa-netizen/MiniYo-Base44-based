/**
 * Shared hook for CMS section data.
 *
 * All home components that previously called
 *   base44.entities.CmsSection.filter({ section_key: 'X' })
 * were firing a separate HTTP request each (9-11 on homepage load).
 *
 * This hook fetches ALL CMS sections in a single shared React Query call
 * (key: 'cms-sections-all'). Every component that calls useCmsSection()
 * gets the cached result for free — only one network request fires per
 * staleTime window, regardless of how many components are on the page.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useCmsSectionsAll() {
  return useQuery({
    queryKey: ['cms-sections-all'],
    // Home only needs active sections; keeps payload smaller and stable.
    queryFn: () => base44.entities.CmsSection.filter({ is_active: true }, 'sort_order', 200),
    staleTime: 60_000,
  });
}

/**
 * Returns { section, isLoading } for a given section_key.
 * `section` is null while loading or if no matching record exists.
 */
export function useCmsSection(sectionKey) {
  const { data: sections = [], isLoading } = useCmsSectionsAll();
  const section = sections.find((s) => s.section_key === sectionKey) ?? null;
  return { section, isLoading };
}

/**
 * Returns { sections, isLoading } for multiple section keys in one call.
 * Useful for components like DualBanners that need more than one section.
 */
export function useCmsSections(sectionKeys) {
  const { data: all = [], isLoading } = useCmsSectionsAll();
  const sections = sectionKeys.map((key) => all.find((s) => s.section_key === key) ?? null);
  return { sections, isLoading };
}
