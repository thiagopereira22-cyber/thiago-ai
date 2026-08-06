'use client';

import { useContext } from 'react';
import { AuthContext } from '@/hooks/auth-context';

export function useAuth() {
  return useContext(AuthContext);
}
