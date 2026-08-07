export type EmailProvider = 'microsoft' | 'google';

export type EmailAccountStatus = 'pending' | 'connected' | 'syncing' | 'error';

export type ConnectedEmailAccount = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email_address: string;
  display_name?: string | null;
  status: EmailAccountStatus;
  created_at?: string | null;
  updated_at?: string | null;
  last_sync_at?: string | null;
};

export type EmailProviderOption = {
  id: string;
  label: string;
  provider: EmailProvider;
  description: string;
};
