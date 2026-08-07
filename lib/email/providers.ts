import type { EmailProviderOption } from './types';

export const emailProviderOptions: EmailProviderOption[] = [
  {
    id: 'microsoft-outlook',
    label: 'Outlook',
    provider: 'microsoft',
    description: 'Microsoft • Outlook',
  },
  {
    id: 'microsoft-hotmail',
    label: 'Hotmail',
    provider: 'microsoft',
    description: 'Microsoft • Hotmail',
  },
  {
    id: 'microsoft-365',
    label: 'Microsoft 365',
    provider: 'microsoft',
    description: 'Microsoft • Microsoft 365',
  },
  {
    id: 'google-gmail',
    label: 'Gmail',
    provider: 'google',
    description: 'Google • Gmail',
  },
];

export function getEmailProviderLabel(provider: string) {
  const option = emailProviderOptions.find((item) => item.provider === provider);
  return option?.label ?? provider;
}
