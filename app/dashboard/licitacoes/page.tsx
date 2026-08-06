import { FileText, Plus, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const licitacoes = [
  {
    title: 'Licitação - Fornecimento de Equipamentos',
    client: 'Prefeitura Municipal',
    deadline: '10/08/2026',
    status: 'Em andamento',
    statusType: 'warning' as const,
    icon: Clock,
  },
  {
    title: 'Licitação - Serviços de TI',
    client: 'Tribunal de Justiça',
    deadline: '15/08/2026',
    status: 'Aberta',
    statusType: 'info' as const,
    icon: AlertCircle,
  },
  {
    title: 'Licitação - Material de Escritório',
    client: 'Secretaria de Educação',
    deadline: '02/08/2026',
    status: 'Concluída',
    statusType: 'success' as const,
    icon: CheckCircle2,
  },
];

export default function LicitacoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Licitações
          </h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe as licitações e propostas em andamento
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Nova Licitação
        </Button>
      </div>

      <div className="grid gap-4">
        {licitacoes.map((item, i) => {
          const Icon = item.icon;
          return (
            <Card key={i} className="border-border bg-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">
                        {item.client}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`flex items-center gap-1.5 ${
                      item.statusType === 'success'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : item.statusType === 'warning'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-primary/15 text-primary'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Prazo: <span className="font-medium text-foreground">{item.deadline}</span>
                  </span>
                  <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-secondary">
                    Ver detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
