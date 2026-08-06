import { createSupabaseBrowserClient } from './supabase-browser';

export { createSupabaseBrowserClient as createClient };
export const supabase = createSupabaseBrowserClient();
