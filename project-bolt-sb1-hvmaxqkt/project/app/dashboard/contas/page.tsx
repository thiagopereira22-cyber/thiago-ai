import { Wallet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function ContasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Contas
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie suas contas e integrações financeiras
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: 'Conta Corrente', balance: 'R$ 450.000,00', type: 'Banco do Brasil' },
          { name: 'Conta Poupança', balance: 'R$ 120.000,00', type: 'Caixa Econômica' },
          { name: 'Conta Investimento', balance: 'R$ 780.000,00', type: 'Itaú' },
        ].map((account) => (
          <Card key={account.name} className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
              </div>
              <CardTitle className="text-base font-semibold text-foreground">
                {account.name}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {account.type}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {account.balance}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
