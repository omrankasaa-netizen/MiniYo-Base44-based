import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUtmAttribution } from '@/lib/utmAttribution';

export default function UtmAttributionCapture() {
  const { search, pathname } = useLocation();

  useEffect(() => {
    captureUtmAttribution(search, pathname);
  }, [search, pathname]);

  return null;
}
