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
    value: '5',
    change: '+1 em relação a ontem',
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

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Visão Geral
        </h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe os principais indicadores da sua operação
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription className="text-xs font-medium text-muted-foreground">
                  {stat.label}
                </CardDescription>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-[18px] w-[18px] text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {stat.value}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {stat.trend === 'up' ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span
                    className={
                      stat.trend === 'up'
                        ? 'text-emerald-500'
                        : 'text-red-500'
                    }
                  >
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Atividade Recente
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Últimas movimentações no sistema
            </CardDescription>
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
            <CardTitle className="text-base font-semibold text-foreground">
              Próximos Compromissos
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Agenda dos próximos dias
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: 'Reunião de licitação', date: 'Hoje, 14:00' },
              { title: 'Análise de investimentos', date: 'Amanhã, 09:30' },
              { title: 'Revisão de contas', date: '08/08, 16:00' },
              { title: 'Apresentação ao cliente', date: '10/08, 10:00' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-foreground">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground">{item.date}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
