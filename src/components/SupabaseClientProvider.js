// src/components/SupabaseClientProvider.js
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { useState } from 'react';

export default function SupabaseClientProvider({ children }) {
  const hasSupabaseConfig = 
    typeof window !== 'undefined' && 
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [supabaseClient] = useState(() => {
    if (!hasSupabaseConfig) {
      return null;
    }
    return createClientComponentClient();
  });

  if (!hasSupabaseConfig) {
    return <>{children}</>;
  }

  return (
    <SessionContextProvider supabaseClient={supabaseClient}>
      {children}
    </SessionContextProvider>
  );
}