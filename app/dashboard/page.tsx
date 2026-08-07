'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  CalendarDays,
  FileText,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type EventRecord = {
  id?: string;
  title?: string | null;
  description?: string | null;
  event_date?: string | null;
  created_at?: string | null;
  origin?: string | null;
};

const stats = [
  {
    label: 'Contas Ativas',
    value: '12',
    change: '+2 este mês',
    icon: Wallet,
    trend: 'up',
  },
  {
    label: 'Compromissos Hoje',
    value: '0',
    change: 'Carregando...',
    icon: CalendarDays,
    trend: 'up',
  },
  {
    label: 'Licitações Abertas',
    value: '8',
    change: '-3 esta semana',
    icon: FileText,
    trend: 'down',
  },
  {
    label: 'Investimentos',
    value: 'R$ 1,2M',
    change: '+12,5% no ano',
    icon: TrendingUp,
    trend: 'up',
  },
];

function getDateKey(value: unknown) {
  if (!value) {
    return null;
  }

  const rawValue = String(value);
  const normalizedValue = rawValue.includes('T') ? rawValue.split('T')[0] : rawValue;
  const [year, month, day] = normalizedValue.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getEventTimestamp(event: EventRecord) {
  if (!event.created_at) {
    const dateKey = getDateKey(event.event_date);
    if (!dateKey) {
      return Number.POSITIVE_INFINITY;
    }

    const value = Date.parse(`${dateKey}T00:00:00`);
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
  }

  const value = Date.parse(String(event.created_at));
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export default function DashboardPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);

  useEffect(() => {
    async function fetchEvents() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true }).order('created_at', { ascending: true });
      setEvents((data ?? []) as EventRecord[]);
    }

    void fetchEvents();
  }, []);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return events
      .filter((event) => getDateKey(event.event_date) === todayValue)
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
  }, [events]);

  const statsWithValues = useMemo(() => {
    const now = new Date();
    const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayCount = events.filter((event) => getDateKey(event.event_date) === todayValue).length;

    return [
      {
        ...stats[0],
      },
      {
        ...stats[1],
        value: String(todayCount),
        change: todayCount === 1 ? '1 compromisso hoje' : `${todayCount} compromissos hoje`,
      },
      stats[2],
      stats[3],
    ];
  }, [events]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Visão Geral</h2>
        <p className="text-sm text-muted-foreground">Acompanhe os principais indicadores da sua operação</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsWithValues.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription className="text-xs font-medium text-muted-foreground">{stat.label}</CardDescription>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-[18px] w-[18px] text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {stat.trend === 'up' ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={stat.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}>{stat.change}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Atividade Recente</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Últimas movimentações no sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { text: 'Nova licitação cadastrada', time: 'há 2 horas' },
              { text: 'Reunião agendada com cliente', time: 'há 4 horas' },
              { text: 'Investimento atualizado', time: 'há 1 dia' },
              { text: 'Nova conta vinculada', time: 'há 2 dias' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-sm text-foreground">{item.text}</span>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Próximos Compromissos</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Agenda dos próximos dias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum compromisso cadastrado para hoje.</p>
            ) : (
              upcomingEvents.map((event) => (
                <div key={event.id ?? event.title} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground">{event.title ?? 'Compromisso sem título'}</span>
                  <span className="text-xs text-muted-foreground">{event.event_date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${event.event_date}T00:00:00`)) : '—'}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
