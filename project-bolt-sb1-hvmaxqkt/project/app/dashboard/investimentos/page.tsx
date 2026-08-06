import { TrendingUp, Plus, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function InvestimentosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Investimentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe sua carteira e performance
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Novo Investimento
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Patrimônio Total', value: 'R$ 1.200.000', change: '+12,5%' },
          { label: 'Rendimento Mensal', value: 'R$ 18.500', change: '+3,2%' },
          { label: 'Investido', value: 'R$ 980.000', change: '+8,1%' },
          { label: 'Disponível', value: 'R$ 220.000', change: '+2,4%' },
        ].map((item) => (
          <Card key={item.label} className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                {item.label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{item.value}</p>
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-500">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {item.change}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">
              Distribuição da Carteira
            </CardTitle>
          </div>
          <CardDescription className="text-sm text-muted-foreground">
            Composição dos seus investimentos por classe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: 'Renda Fixa', value: 45, amount: 'R$ 540.000' },
            { name: 'Ações', value: 30, amount: 'R$ 360.000' },
            { name: 'Fundos Imobiliários', value: 15, amount: 'R$ 180.000' },
            { name: 'Criptomoedas', value: 10, amount: 'R$ 120.000' },
          ].map((item) => (
            <div key={item.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span className="text-sm text-muted-foreground">{item.amount}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
