'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
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
import { useToast } from '@/hooks/use-toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type BillRecord = {
  id?: string;
  title?: string | null;
  supplier?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  payment_url?: string | null;
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

function isBillPending(bill: BillRecord) {
  return (bill.status ?? 'Pendente') !== 'Pago';
}

function isBillPaid(bill: BillRecord) {
  return (bill.status ?? 'Pendente') === 'Pago';
}

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

function isDueToday(bill: BillRecord) {
  if (!bill.due_date) {
    return false;
  }

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dueDateValue = getDateKey(bill.due_date);

  return dueDateValue === todayValue;
}

function isDueTomorrow(bill: BillRecord) {
  if (!bill.due_date) {
    return false;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowValue = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const dueDateValue = getDateKey(bill.due_date);

  return dueDateValue === tomorrowValue;
}

function isBillOverdue(bill: BillRecord) {
  if ((bill.status ?? 'Pendente') === 'Pago') {
    return false;
  }

  if (!bill.due_date) {
    return false;
  }

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dueDateValue = getDateKey(bill.due_date);

  if (!dueDateValue) {
    return false;
  }

  return dueDateValue < todayValue;
}

function getBillDueStatus(bill: BillRecord) {
  if ((bill.status ?? 'Pendente') === 'Pago') {
    return 'paid';
  }

  if (isBillOverdue(bill)) {
    return 'overdue';
  }

  if (isDueToday(bill)) {
    return 'due_today';
  }

  if (isDueTomorrow(bill)) {
    return 'due_tomorrow';
  }

  return 'pending';
}

function getBillDueDateTimestamp(bill: BillRecord) {
  if (!bill.due_date) {
    return Number.POSITIVE_INFINITY;
  }

  const value = Date.parse(String(bill.due_date));
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function getBillAmountValue(bill: BillRecord) {
  const amount = Number(bill.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export default function ContasPage() {
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'closest_due' | 'farthest_due' | 'highest_amount' | 'lowest_amount'>('closest_due');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billToDelete, setBillToDelete] = useState<BillRecord | null>(null);
  const [form, setForm] = useState<BillFormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

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

  function resetForm() {
    setForm(initialFormState);
    setEditingBillId(null);
    setFormError(null);
  }

async function handleScanEmailBills() {
  try {
    const response = await fetch(
  '/api/integrations/microsoft/scan-bills',
  {
    method: 'POST',
  }
);

    const responseText = await response.text();

let data: any = {};

if (responseText) {
  try {
    data = JSON.parse(responseText);
    console.log('Resultado scan-bills:', data);
  } catch {
    throw new Error(
      `Resposta inválida do servidor. HTTP ${response.status}`
    );
  }
}

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao analisar e-mails.');
    }

    await fetchBills();

    toast({
      title: 'E-mails analisados',
      description: `${data.scanned} analisados • ${data.detected} financeiros • ${data.created} contas criadas • ${data.duplicates} duplicadas • ${data.incomplete} incompletas`,
    });
  } catch (error) {
    toast({
      title: 'Erro ao analisar e-mails',
      description:
        error instanceof Error
          ? error.message
          : 'Não foi possível analisar os e-mails.',
    });
  }
}

  function handleOpenCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function clearFilters() {
    setSearchTerm('');
    setActiveFilter('all');
    setSortOrder('closest_due');
  }

  function handleOpenEditModal(bill: BillRecord) {
    setEditingBillId(bill.id ?? null);
    setForm({
      title: bill.title ?? '',
      supplier: bill.supplier ?? '',
      amount: String(bill.amount ?? ''),
      dueDate: bill.due_date ?? '',
      status: bill.status ?? 'Pendente',
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  function handleModalOpenChange(open: boolean) {
    setIsModalOpen(open);
    if (!open) {
      resetForm();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (isSubmitting) {
      return;
    }

    if (!form.title.trim()) {
      setFormError('O título é obrigatório.');
      return;
    }

    if (!form.amount.trim()) {
      setFormError('O valor é obrigatório.');
      return;
    }

    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError('O valor deve ser maior que zero.');
      return;
    }

    if (!form.dueDate) {
      setFormError('A data de vencimento é obrigatória.');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);

const {
  data: { user },
  error: userError,
} = await supabase.auth.getUser();

if (userError || !user) {
  setFormError('Não foi possível identificar o usuário.');
  setIsSubmitting(false);
  return;
}

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('company_id')
  .eq('id', user.id)
  .single();

if (profileError || !profile?.company_id) {
  setFormError('Não foi possível identificar a empresa do usuário.');
  setIsSubmitting(false);
  return;
}

const companyId = profile.company_id;

    if (editingBillId) {
      const { error: updateError } = await supabase
        .from('bills')
        .update({
          title: form.title.trim(),
          supplier: form.supplier.trim() || null,
          amount: Number(form.amount),
          due_date: form.dueDate,
          status: form.status,
        })
        .eq('id', editingBillId);

      if (updateError) {
        setFormError('Não foi possível atualizar a conta.');
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from('bills').insert([
        {
          company_id: companyId,
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
    }

    setIsSubmitting(false);
    setIsModalOpen(false);
    resetForm();
    await fetchBills();

    toast({
      title: editingBillId ? 'Conta editada' : 'Conta criada',
      description: editingBillId
        ? 'Os dados da conta foram atualizados com sucesso.'
        : 'A nova conta foi criada com sucesso.',
    });
  }

  async function handleMarkAsPaid(billId?: string) {
    if (!billId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('bills')
      .update({ status: 'Pago' })
      .eq('id', billId);

    if (updateError) {
      setError('Não foi possível atualizar o status da conta.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    await fetchBills();

    toast({
      title: 'Conta marcada como paga',
      description: 'A conta foi atualizada para o status Pago.',
    });
  }

  function handleOpenDeleteModal(bill: BillRecord) {
    setBillToDelete(bill);
    setIsDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!billToDelete?.id) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from('bills')
      .delete()
      .eq('id', billToDelete.id);

    if (deleteError) {
      setError('Não foi possível excluir a conta.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsDeleteModalOpen(false);
    setBillToDelete(null);
    await fetchBills();

    toast({
      title: 'Conta excluída',
      description: 'A conta foi removida com sucesso.',
    });
  }

  const filteredBills = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = bills.filter((bill) => {
      const status = bill.status ?? 'Sem status';
      const isOverdueBill = isBillOverdue(bill);
      const matchesFilter =
        activeFilter === 'pending'
          ? status !== 'Pago'
          : activeFilter === 'overdue'
            ? isOverdueBill
            : activeFilter === 'paid'
              ? status === 'Pago'
              : true;

      if (!normalizedSearch) {
        return matchesFilter;
      }

      const title = (bill.title ?? '').toLowerCase();
      const supplier = (bill.supplier ?? '').toLowerCase();
      const matchesSearch = title.includes(normalizedSearch) || supplier.includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortOrder === 'highest_amount') {
        return getBillAmountValue(b) - getBillAmountValue(a);
      }

      if (sortOrder === 'lowest_amount') {
        return getBillAmountValue(a) - getBillAmountValue(b);
      }

      const aDueDate = getBillDueDateTimestamp(a);
      const bDueDate = getBillDueDateTimestamp(b);

      if (aDueDate === Number.POSITIVE_INFINITY && bDueDate === Number.POSITIVE_INFINITY) {
        return 0;
      }

      if (aDueDate === Number.POSITIVE_INFINITY) {
        return 1;
      }

      if (bDueDate === Number.POSITIVE_INFINITY) {
        return -1;
      }

      if (sortOrder === 'farthest_due') {
        return bDueDate - aDueDate;
      }

      return aDueDate - bDueDate;
    });

    return sorted;
  }, [activeFilter, bills, searchTerm, sortOrder]);

  const metrics = useMemo(() => {
    const pendingBills = bills.filter(isBillPending);
    const paidBills = bills.filter(isBillPaid);
    const overdueBills = bills.filter(isBillOverdue);
    const dueTodayBills = bills.filter(isDueToday);
    const totalPending = pendingBills.reduce((sum, bill) => sum + getBillAmountValue(bill), 0);
    const totalOverdue = overdueBills.reduce((sum, bill) => sum + getBillAmountValue(bill), 0);
    const totalPaid = paidBills.reduce((sum, bill) => sum + getBillAmountValue(bill), 0);
    const totalToPay = pendingBills.reduce((sum, bill) => sum + getBillAmountValue(bill), 0);

    return {
      pendingCount: pendingBills.length,
      overdueCount: overdueBills.length,
      paidCount: paidBills.length,
      dueTodayCount: dueTodayBills.length,
      totalPending,
      totalOverdue,
      totalPaid,
      totalToPay,
    };
  }, [bills]);

  const hasActiveFilters = searchTerm.trim() !== '' || activeFilter !== 'all' || sortOrder !== 'closest_due';

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
        <div className="flex flex-wrap gap-2">
  <Button
    type="button"
    variant="outline"
    onClick={handleScanEmailBills}
  >
    Buscar contas nos e-mails
  </Button>

  <Button
    className="bg-primary text-primary-foreground hover:bg-primary/90"
    onClick={handleOpenCreateModal}
  >
    <Plus className="mr-2 h-4 w-4" />
    Nova Conta
  </Button>
</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics.pendingCount}
            </div>
            <p className="text-sm text-muted-foreground">Contas ainda não pagas</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vencidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics.overdueCount}
            </div>
            <p className="text-sm text-muted-foreground">Contas pendentes vencidas</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pagas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics.paidCount}
            </div>
            <p className="text-sm text-muted-foreground">Contas quitadas</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vencem Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {metrics.dueTodayCount}
            </div>
            <p className="text-sm text-muted-foreground">Contas com vencimento para hoje</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total a Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(metrics.totalToPay)}
            </div>
            <p className="text-sm text-muted-foreground">Soma dos valores pendentes</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('all')}
        >
          Todas
        </Button>
        <Button
          type="button"
          variant={activeFilter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('pending')}
        >
          Pendentes
        </Button>
        <Button
          type="button"
          variant={activeFilter === 'overdue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('overdue')}
        >
          Vencidas
        </Button>
        <Button
          type="button"
          variant={activeFilter === 'paid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveFilter('paid')}
        >
          Pagas
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por título ou fornecedor..."
            className="pl-9"
          />
        </div>

        <div className="w-full space-y-2 md:w-56">
          <Label htmlFor="sort-by">Ordenar por</Label>
          <select
            id="sort-by"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="closest_due">Vencimento mais próximo</option>
            <option value="farthest_due">Vencimento mais distante</option>
            <option value="highest_amount">Maior valor</option>
            <option value="lowest_amount">Menor valor</option>
          </select>
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="flex justify-start">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total pendente</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(metrics.totalPending)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total vencido</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(metrics.totalOverdue)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total pago</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(metrics.totalPaid)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {error}
        </div>
      ) : isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Carregando contas...
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            {bills.length === 0 ? 'Você ainda não possui contas cadastradas.' : 'Nenhuma conta encontrada.'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {bills.length === 0
              ? 'Cadastre sua primeira conta para começar a organizar seus pagamentos.'
              : 'Tente ajustar a pesquisa, os filtros ou a ordenação.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {bills.length > 0 ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : null}
            <Button type="button" onClick={handleOpenCreateModal}>
              + Nova Conta
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBills.map((bill) => {
            const title = bill.title ?? 'Conta sem título';
            const supplier = bill.supplier ?? '—';
            const value = bill.amount ?? 0;
            const dueDate = bill.due_date ?? null;
            const status = bill.status ?? 'Sem status';
            const isPaid = status === 'Pago';
            const dueStatus = getBillDueStatus(bill);
            const displayStatus = dueStatus === 'overdue' ? 'Vencida' : dueStatus === 'due_today' ? 'Vence hoje' : dueStatus === 'due_tomorrow' ? 'Vence amanhã' : status;
            const isOverdue = dueStatus === 'overdue';
            const cardClasses = isOverdue
              ? 'border-red-500/40 bg-red-500/10 shadow-sm'
              : 'border-border bg-card';

            return (
              <Card key={bill.id ?? title} className={cardClasses}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isOverdue ? 'bg-red-500/15' : 'bg-primary/10'}`}>
                      <Wallet className={`h-5 w-5 ${isOverdue ? 'text-red-500' : 'text-primary'}`} />
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
                      <span className={isOverdue ? 'font-semibold text-red-500' : 'font-medium text-foreground'}>
                        {displayStatus}
                      </span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenEditModal(bill)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => void handleMarkAsPaid(bill.id)}
                      disabled={isSubmitting || isPaid}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {isPaid ? 'Conta paga' : 'Marcar como paga'}
                    </Button>
                    {bill.payment_url ? (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="flex-1"
    onClick={() =>
      window.open(
        bill.payment_url!,
        '_blank',
        'noopener,noreferrer'
      )
    }
  >
    Abrir boleto
  </Button>
) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenDeleteModal(bill)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingBillId ? 'Editar conta' : 'Nova conta'}</DialogTitle>
            <DialogDescription>
              {editingBillId
                ? 'Atualize os dados da conta selecionada.'
                : 'Preencha os dados da conta abaixo.'}
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
                onClick={() => handleModalOpenChange(false)}
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

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excluir conta</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta conta?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setBillToDelete(null);
              }}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
