'use client';

import { useEffect, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type BillRecord = {
  id?: string;
  title?: string | null;
  supplier?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
};

type BillFormState = {
  title: string;
  supplier: string;
  amount: string;
  dueDate: string;
  status: string;
};

const initialFormState: BillFormState = {
  title: '',
  supplier: '',
  amount: '',
  dueDate: '',
  status: 'Pendente',
};

function formatCurrency(value: unknown) {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue)) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(numericValue);
  }

  return 'R$ 0,00';
}

function formatDate(value: unknown) {
  if (!value) {
    return '—';
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
  }).format(date);
}

export default function ContasPage() {
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<BillFormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBills();
  }, []);

  async function fetchBills() {
    const supabase = createSupabaseBrowserClient();
    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('bills')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Não foi possível carregar as contas no momento.');
      setBills([]);
    } else {
      setBills((data ?? []) as BillRecord[]);
    }

    setIsLoading(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.title.trim()) {
      setFormError('O título é obrigatório.');
      return;
    }

    if (!form.amount.trim()) {
      setFormError('O valor é obrigatório.');
      return;
    }

    if (!form.dueDate) {
      setFormError('A data de vencimento é obrigatória.');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);

    const { error: insertError } = await supabase.from('bills').insert([
      {
        title: form.title.trim(),
        supplier: form.supplier.trim() || null,
        amount: Number(form.amount),
        due_date: form.dueDate,
        status: form.status,
      },
    ]);

    if (insertError) {
      setFormError('Não foi possível salvar a conta.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsModalOpen(false);
    setForm(initialFormState);
    await fetchBills();
  }

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
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {error}
        </div>
      ) : isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Carregando contas...
        </div>
      ) : bills.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma conta encontrada.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bills.map((bill) => {
            const title = bill.title ?? 'Conta sem título';
            const supplier = bill.supplier ?? '—';
            const value = bill.amount ?? 0;
            const dueDate = bill.due_date ?? null;
            const status = bill.status ?? 'Sem status';

            return (
              <Card key={bill.id ?? title} className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground">
                    {title}
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    {supplier}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(value)}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Vencimento:</span>{' '}
                      {formatDate(dueDate)}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Status:</span>{' '}
                      {status}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>
              Preencha os dados da conta abaixo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ex.: Aluguel"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Fornecedor</Label>
              <Input
                id="supplier"
                value={form.supplier}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supplier: event.target.value }))
                }
                placeholder="Ex.: Imobiliária"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="0,00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Data de vencimento</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="Pendente">Pendente</option>
                <option value="Pago">Pago</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
