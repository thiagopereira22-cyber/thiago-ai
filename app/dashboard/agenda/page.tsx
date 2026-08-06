import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function AgendaPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Agenda
          </h2>
          <p className="text-sm text-muted-foreground">
            Visualize e organize seus compromissos
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Novo Compromisso
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border bg-card lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Calendário
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Agosto de 2026
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="py-1 text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <div
                  key={day}
                  className={`flex h-9 items-center justify-center rounded-md text-sm ${
                    day === 6
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Compromissos do Dia
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              06 de Agosto de 2026
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { time: '09:00', title: 'Reunião de equipe', desc: 'Sala de reuniões 1' },
              { time: '11:00', title: 'Ligação com fornecedor', desc: 'Online' },
              { time: '14:00', title: 'Reunião de licitação', desc: 'Prefeitura Municipal' },
              { time: '16:30', title: 'Revisão de contrato', desc: 'Sala 3' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-lg bg-secondary/40 p-3"
              >
                <span className="min-w-[50px] text-sm font-semibold text-primary">
                  {item.time}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
