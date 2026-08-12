import Link from 'next/link';
import { User, Bell, Shield, Palette, Globe, Mail, Plus, CheckCircle2, AlertCircle, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { emailProviderOptions } from '@/lib/email/providers';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function formatDate(value: string | null) {
  if (!value) return 'Ainda não sincronizado';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: connectedAccounts } = user
    ? await supabase
        .from('connected_email_accounts')
        .select('id, provider, email_address, display_name, status, created_at, updated_at, last_sync_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] };

const { data: connectedCalendars } = user
  ? await supabase
      .from('connected_calendar_accounts')
      .select(
        'id, provider, email_address, calendar_id, status, created_at, updated_at, last_sync_at'
      )
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .order('created_at', { ascending: false })
  : { data: [] };

const googleStatus = searchParams?.google;

const googleMessage =
  googleStatus === 'connected'
    ? {
        tone: 'success',
        text: 'Google Calendar conectado com sucesso.',
      }
    : googleStatus
    ? {
        tone: 'error',
        text: 'Não foi possível conectar o Google Calendar. Tente novamente.',
      }
    : null;

  const statusMessage = searchParams?.microsoft;
  const messageContent =
    statusMessage === 'connected'
      ? {
          tone: 'success',
          text: 'Conta Microsoft conectada com sucesso. Você já pode ver sua conta na lista abaixo.',
        }
      : statusMessage === 'error'
        ? {
            tone: 'error',
            text: 'A autorização foi cancelada ou falhou. Tente novamente.',
          }
        : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Configurações
        </h2>
        <p className="text-sm text-muted-foreground">
          Gerencie suas preferências e dados da conta
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                E-mails conectados
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Conecte suas contas de e-mail para que o Omnia possa identificar mensagens, anexos, contas, documentos e compromissos automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {messageContent ? (
              <div className={`flex items-start gap-2 rounded-lg border p-3 ${messageContent.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                {messageContent.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
                <p className="text-sm">{messageContent.text}</p>
              </div>
            ) : null}

            {connectedAccounts && connectedAccounts.length > 0 ? (
              <div className="space-y-2">
                {connectedAccounts.map((account) => (
                  <div key={account.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background/70 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{account.email_address}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.display_name || 'Conta Microsoft'} • {account.provider}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Status: <span className="font-medium text-foreground">{account.status}</span> • Última sincronização: {formatDate(account.last_sync_at)}
                      </p>
                    </div>
                    <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Conectado
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Nenhuma conta de e-mail conectada.</p>
                  <p className="text-sm text-muted-foreground">
                    Conecte sua conta Microsoft para permitir a leitura de e-mails e anexos no Omnia.
                  </p>
                </div>
                <Button asChild type="button" variant="outline" className="border-border text-foreground hover:bg-secondary">
                  <Link href="/api/integrations/microsoft/connect">
                    <Plus className="mr-2 h-4 w-4" />
                    Conectar Microsoft
                  </Link>
                </Button>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background/70 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Provedores disponíveis</p>
              <div className="grid gap-3 md:grid-cols-2">
                {emailProviderOptions.map((option) => (
                  <div key={option.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                      {option.provider === 'microsoft' ? (
                        <Button asChild type="button" variant="ghost" size="sm" className="text-primary">
                          <Link href="/api/integrations/microsoft/connect">Conectar</Link>
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled>
                          Em breve
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Suporta Outlook, Hotmail, Microsoft 365 e contas pessoais ou corporativas da Microsoft.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Perfil
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Atualize suas informações pessoais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Nome</Label>
              <Input defaultValue="Thiago" className="border-border bg-secondary" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">E-mail</Label>
              <Input
                type="email"
                defaultValue="thiago@thiagoai.com"
                className="border-border bg-secondary"
              />
            </div>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Salvar alterações
            </Button>
          </CardContent>
        </Card>
<Card className="border-border bg-card lg:col-span-2">
  <CardHeader>
    <div className="flex items-center gap-2">
      <CalendarDays className="h-5 w-5 text-primary" />
      <CardTitle className="text-base font-semibold text-foreground">
        Google Calendar
      </CardTitle>
    </div>

    <CardDescription className="text-sm text-muted-foreground">
      Conecte sua agenda Google para que o Omnia crie
      automaticamente compromissos de vencimento das suas contas.
    </CardDescription>
  </CardHeader>

  <CardContent className="space-y-4">
    {googleMessage ? (
      <div
        className={`flex items-start gap-2 rounded-lg border p-3 ${
          googleMessage.tone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
        }`}
      >
        {googleMessage.tone === 'success' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4" />
        )}

        <p className="text-sm">
          {googleMessage.text}
        </p>
      </div>
    ) : null}

    {connectedCalendars &&
    connectedCalendars.length > 0 ? (
      <div className="space-y-2">
        {connectedCalendars.map((calendar) => (
          <div
            key={calendar.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {calendar.email_address}
              </p>

              <p className="text-xs text-muted-foreground">
                Google Calendar • {calendar.calendar_id}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Status:{' '}
                <span className="font-medium text-foreground">
                  {calendar.status}
                </span>
              </p>
            </div>

            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Conectado
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Nenhum Google Calendar conectado.
          </p>

          <p className="text-sm text-muted-foreground">
            Autorize o Omnia a criar os vencimentos diretamente
            na sua agenda Google.
          </p>
        </div>

        <Button
          asChild
          type="button"
          variant="outline"
          className="border-border text-foreground hover:bg-secondary"
        >
          <Link href="/api/integrations/google/connect">
            <Plus className="mr-2 h-4 w-4" />
            Conectar Google Calendar
          </Link>
        </Button>
      </div>
    )}
  </CardContent>
</Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Notificações
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Configure como você recebe alertas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Notificações por e-mail', desc: 'Receba atualizações no seu e-mail' },
              { label: 'Alertas de licitação', desc: 'Seja avisado de novas oportunidades' },
              { label: 'Resumo diário', desc: 'Receba um resumo das atividades do dia' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Segurança
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Proteja sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Senha atual</Label>
              <Input type="password" placeholder="••••••••" className="border-border bg-secondary" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Nova senha</Label>
              <Input type="password" placeholder="••••••••" className="border-border bg-secondary" />
            </div>
            <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
              Atualizar senha
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Aparência
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Personalize a interface do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Tema escuro</p>
                <p className="text-xs text-muted-foreground">Ativar modo escuro</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Animações
                </p>
                <p className="text-xs text-muted-foreground">
                  Ativar transições suaves
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Idioma
                </p>
                <p className="text-xs text-muted-foreground">
                  Português (Brasil)
                </p>
              </div>
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
