import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export function useCustomerTier(email) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(!!email);

  useEffect(() => {
    if (!email) {
      setCustomer(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    base44.entities.Customer.filter({ email }, 'created_date', 1)
      .then(results => setCustomer(results[0] || null))
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false));
  }, [email]);

  return { customer, loading };
}