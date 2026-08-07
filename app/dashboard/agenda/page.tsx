'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type EventRecord = {
  id?: string;
  title?: string | null;
  description?: string | null;
  event_date?: string | null;
  created_at?: string | null;
  origin?: string | null;
};

type EventFormState = {
  title: string;
  description: string;
  eventDate: string;
  eventTime: string;
  origin: string;
};

const initialFormState: EventFormState = {
  title: '',
  description: '',
  eventDate: '',
  eventTime: '09:00',
  origin: '',
};

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

function formatTime(value: unknown) {
  if (!value) {
    return '—';
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function getEventDateKey(event: EventRecord) {
  return getDateKey(event.event_date) ?? getDateKey(event.created_at);
}

function getEventTimestamp(event: EventRecord) {
  if (!event.created_at) {
    const dateKey = getEventDateKey(event);
    if (!dateKey) {
      return Number.POSITIVE_INFINITY;
    }

    const value = Date.parse(`${dateKey}T00:00:00`);
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
  }

  const value = Date.parse(String(event.created_at));
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function isSameDay(value: string | null | undefined, target: Date) {
  if (!value) {
    return false;
  }

  const normalized = getDateKey(value);
  if (!normalized) {
    return false;
  }

  const todayValue = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  return normalized === todayValue;
}

function isUpcomingIn7Days(value: string | null | undefined, target: Date) {
  if (!value) {
    return false;
  }

  const normalized = getDateKey(value);
  if (!normalized) {
    return false;
  }

  const start = new Date(target);
  const end = new Date(target);
  end.setDate(end.getDate() + 7);

  const current = new Date(`${normalized}T00:00:00`);
  return current >= start && current <= end;
}

function isOverdue(event: EventRecord) {
  const timestamp = getEventTimestamp(event);
  if (timestamp === Number.POSITIVE_INFINITY) {
    return false;
  }

  return timestamp < Date.now();
}

export default function AgendaPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'today' | 'next7' | 'all'>('today');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'closest' | 'farthest'>('closest');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventToDelete, setEventToDelete] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<EventFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    void fetchEvents();
  }, []);

  async function fetchEvents() {
    const supabase = createSupabaseBrowserClient();
    setIsLoading(true);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setEvents([]);
      toast({
        title: 'Não foi possível carregar a agenda',
        description: 'Verifique a conexão com o Supabase e as permissões da tabela events.',
      });
    } else {
      setEvents((data ?? []) as EventRecord[]);
    }

    setIsLoading(false);
  }

  function resetForm() {
    setForm(initialFormState);
    setEditingEventId(null);
    setFormError(null);
  }

  function handleOpenCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function handleOpenEditModal(event: EventRecord) {
    setEditingEventId(event.id ?? null);
    setForm({
      title: event.title ?? '',
      description: event.description ?? '',
      eventDate: getDateKey(event.event_date) ?? '',
      eventTime: event.created_at ? new Date(String(event.created_at)).toTimeString().slice(0, 5) : '09:00',
      origin: event.origin ?? '',
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

  function clearFilters() {
    setActiveView('today');
    setSearchTerm('');
    setSortOrder('closest');
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

    if (!form.eventDate) {
      setFormError('A data é obrigatória.');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);

    const scheduledDate = new Date(`${form.eventDate}T${form.eventTime || '09:00'}`);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.eventDate,
      created_at: scheduledDate.toISOString(),
      origin: form.origin.trim() || null,
    };

    let error;
    if (editingEventId) {
      ({ error } = await supabase.from('events').update(payload).eq('id', editingEventId));
    } else {
      ({ error } = await supabase.from('events').insert([payload]));
    }

    setIsSubmitting(false);

    if (error) {
      setFormError('Não foi possível salvar o compromisso.');
      return;
    }

    setIsModalOpen(false);
    resetForm();
    await fetchEvents();

    toast({
      title: editingEventId ? 'Compromisso editado' : 'Compromisso criado',
      description: editingEventId
        ? 'O compromisso foi atualizado com sucesso.'
        : 'O novo compromisso foi adicionado à agenda.',
    });
  }

  function handleOpenDeleteModal(event: EventRecord) {
    setEventToDelete(event);
    setIsDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!eventToDelete?.id) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);

    const { error } = await supabase.from('events').delete().eq('id', eventToDelete.id);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Não foi possível excluir o compromisso',
        description: 'Tente novamente em instantes.',
      });
      return;
    }

    setIsDeleteModalOpen(false);
    setEventToDelete(null);
    await fetchEvents();

    toast({
      title: 'Compromisso excluído',
      description: 'O compromisso foi removido da agenda.',
    });
  }

  const metrics = useMemo(() => {
    const now = new Date();
    const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayEvents = events.filter((event) => getEventDateKey(event) === todayValue);
    const upcoming7DaysEvents = events.filter((event) => isUpcomingIn7Days(getEventDateKey(event), now));
    const overdueEvents = events.filter((event) => isOverdue(event));

    return {
      todayCount: todayEvents.length,
      next7DaysCount: upcoming7DaysEvents.length,
      overdueCount: overdueEvents.length,
      totalCount: events.length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase();
    const now = new Date();

    const filtered = events.filter((event) => {
      const title = (event.title ?? '').toLowerCase();
      const description = (event.description ?? '').toLowerCase();
      const matchesSearch = !searchValue || title.includes(searchValue) || description.includes(searchValue);

      const dateKey = getEventDateKey(event);
      const matchesView =
        activeView === 'today'
          ? dateKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          : activeView === 'next7'
            ? isUpcomingIn7Days(dateKey, now)
            : true;

      return matchesSearch && matchesView;
    });

    return [...filtered].sort((a, b) => {
      const aTime = getEventTimestamp(a);
      const bTime = getEventTimestamp(b);
      return sortOrder === 'closest' ? aTime - bTime : bTime - aTime;
    });
  }, [activeView, events, searchTerm, sortOrder]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, EventRecord[]>();

    filteredEvents.forEach((event) => {
      const key = getEventDateKey(event) ?? 'Sem data';
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Sem data') return 1;
      if (b === 'Sem data') return -1;
      return a.localeCompare(b);
    });
  }, [filteredEvents]);

  const hasActiveFilters = activeView !== 'today' || searchTerm.trim() !== '' || sortOrder !== 'closest';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h2>
          <p className="text-sm text-muted-foreground">Visualize e organize seus compromissos</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleOpenCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Compromisso
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.todayCount}</div>
            <p className="text-sm text-muted-foreground">Compromissos para hoje</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.next7DaysCount}</div>
            <p className="text-sm text-muted-foreground">Compromissos na semana</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atrasados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.overdueCount}</div>
            <p className="text-sm text-muted-foreground">Compromissos já vencidos</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.totalCount}</div>
            <p className="text-sm text-muted-foreground">Total cadastrado</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={activeView === 'today' ? 'default' : 'outline'} size="sm" onClick={() => setActiveView('today')}>
          Hoje
        </Button>
        <Button type="button" variant={activeView === 'next7' ? 'default' : 'outline'} size="sm" onClick={() => setActiveView('next7')}>
          Próximos 7 dias
        </Button>
        <Button type="button" variant={activeView === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setActiveView('all')}>
          Todos
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar compromissos..."
            className="pl-9"
          />
        </div>
        <div className="w-full space-y-2 lg:w-56">
          <Label htmlFor="sort-order">Ordenar por</Label>
          <select
            id="sort-order"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as 'closest' | 'farthest')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="closest">Mais próximos</option>
            <option value="farthest">Mais distantes</option>
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

      {error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{error}</div>
      ) : isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando agenda...</div>
      ) : groupedEvents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            {events.length === 0 ? 'Você ainda não possui compromissos cadastrados.' : 'Nenhum compromisso encontrado.'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {events.length === 0
              ? 'Cadastre seu primeiro compromisso para começar a organizar sua agenda.'
              : 'Tente ajustar a pesquisa ou os filtros para encontrar o que procura.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {events.length > 0 ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : null}
            <Button type="button" onClick={handleOpenCreateModal}>
              + Novo Compromisso
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map(([dateKey, dateEvents]) => {
            const dateLabel = dateKey === 'Sem data' ? 'Sem data' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(`${dateKey}T00:00:00`));
            return (
              <Card key={dateKey} className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">{dateLabel}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dateEvents.map((event) => {
                    const eventDateKey = getEventDateKey(event);
                    const isToday = eventDateKey === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                    const isOverdueEvent = isOverdue(event);
                    const panelClasses = isOverdueEvent
                      ? 'border-red-500/40 bg-red-500/10'
                      : isToday
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-border bg-background/60';

                    return (
                      <div key={event.id ?? event.title} className={`rounded-lg border p-4 ${panelClasses}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-foreground">{event.title ?? 'Compromisso sem título'}</h3>
                              {isOverdueEvent ? (
                                <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-medium text-red-500">Atrasado</span>
                              ) : isToday ? (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-500">Hoje</span>
                              ) : null}
                            </div>
                            {event.description ? <p className="text-sm text-muted-foreground">{event.description}</p> : null}
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span>
                                <span className="font-medium text-foreground">Data:</span> {formatDate(event.event_date ?? event.created_at)}
                              </span>
                              <span>
                                <span className="font-medium text-foreground">Horário:</span> {formatTime(event.created_at)}
                              </span>
                              {event.origin ? (
                                <span>
                                  <span className="font-medium text-foreground">Origem:</span> {event.origin}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenEditModal(event)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => handleOpenDeleteModal(event)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingEventId ? 'Editar compromisso' : 'Novo compromisso'}</DialogTitle>
            <DialogDescription>
              {editingEventId ? 'Atualize os dados deste compromisso.' : 'Cadastre um novo compromisso na sua agenda.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</div> : null}

            <div className="space-y-2">
              <Label htmlFor="event-title">Título</Label>
              <Input id="event-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Reunião com cliente" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-description">Descrição</Label>
              <textarea
                id="event-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Adicione detalhes para o compromisso"
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-date">Data</Label>
                <Input id="event-date" type="date" value={form.eventDate} onChange={(event) => setForm((current) => ({ ...current, eventDate: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time">Horário</Label>
                <Input id="event-time" type="time" value={form.eventTime} onChange={(event) => setForm((current) => ({ ...current, eventTime: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-origin">Origem</Label>
              <Input id="event-origin" value={form.origin} onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))} placeholder="Ex.: Escritório, WhatsApp..." />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => handleModalOpenChange(false)} disabled={isSubmitting}>
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
            <DialogTitle>Excluir compromisso</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este compromisso?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsDeleteModalOpen(false); setEventToDelete(null); }} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={isSubmitting}>
              {isSubmitting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
