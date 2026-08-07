'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

type DocumentRecord = {
  id?: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  due_date?: string | null;
  file_url?: string | null;
  url?: string | null;
  created_at?: string | null;
};

type DocumentFormState = {
  title: string;
  description: string;
  category: string;
  dueDate: string;
  fileUrl: string;
};

const initialFormState: DocumentFormState = {
  title: '',
  description: '',
  category: 'Outros',
  dueDate: '',
  fileUrl: '',
};

const categoryOptions = ['Pessoal', 'Financeiro', 'Trabalho', 'Contratos', 'Outros'];
const acceptedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
const maxFileSizeBytes = 10 * 1024 * 1024;

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

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

function getDocumentTitle(document: DocumentRecord) {
  return document.title ?? document.name ?? 'Documento sem título';
}

function getDocumentUrl(document: DocumentRecord) {
  return document.file_url ?? document.url ?? null;
}

function getDisplayFileName(document: DocumentRecord) {
  if (document.name) {
    return document.name;
  }

  const value = getDocumentUrl(document);
  if (!value) {
    return 'Arquivo anexado';
  }

  const parts = value.split('/').filter(Boolean);
  return parts.at(-1) ?? 'Arquivo anexado';
}

function getDueSoonStatus(document: DocumentRecord) {
  if (!document.due_date) {
    return 'none';
  }

  const due = new Date(String(document.due_date));
  if (Number.isNaN(due.getTime())) {
    return 'none';
  }

  const now = new Date();
  const diffInDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return 'overdue';
  }

  if (diffInDays <= 7) {
    return 'soon';
  }

  return 'normal';
}

function buildStoragePath(file: File) {
  const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
  const timestamp = Date.now();
  return `documents/${timestamp}-${safeName}`;
}

function normalizeStoragePath(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return null;
  }

  return value;
}

export default function DocumentosPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | (typeof categoryOptions)[number]>('all');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'name_asc' | 'name_desc'>('recent');
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentRecord | null>(null);
  const [form, setForm] = useState<DocumentFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    void fetchDocuments();
  }, []);

  async function fetchDocuments() {
    const supabase = createSupabaseBrowserClient();
    setIsLoading(true);
    setSchemaError(null);

    const { data, error } = await supabase
      .from('documents')
      .select('id,title,name,description,category,due_date,file_url,url,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setDocuments([]);
      setSchemaError('A tabela documents ainda não está disponível no Supabase para esta instância do projeto.');
    } else {
      setDocuments((data ?? []) as DocumentRecord[]);
    }

    setIsLoading(false);
  }

  function resetForm() {
    setForm(initialFormState);
    setEditingDocumentId(null);
    setFormError(null);
    setSelectedFile(null);
    setSelectedFileName('');
    setUploadState('idle');
    setUploadMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleOpenCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function handleOpenEditModal(document: DocumentRecord) {
    setEditingDocumentId(document.id ?? null);
    setForm({
      title: getDocumentTitle(document),
      description: document.description ?? '',
      category: document.category ?? 'Outros',
      dueDate: document.due_date ?? '',
      fileUrl: getDocumentUrl(document) ?? '',
    });
    setFormError(null);
    setSelectedFile(null);
    setSelectedFileName(getDisplayFileName(document));
    setUploadState('idle');
    setUploadMessage(null);
    setIsModalOpen(true);
  }

  function handleModalOpenChange(open: boolean) {
    setIsModalOpen(open);
    if (!open) {
      resetForm();
    }
  }

  function clearFilters() {
    setSearchTerm('');
    setFilterCategory('all');
    setSortOrder('recent');
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelectedFile(null);
      setSelectedFileName('');
      setUploadState('idle');
      setUploadMessage(null);
      return;
    }

    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!acceptedExtensions.includes(extension) && !['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setSelectedFile(null);
      setSelectedFileName('');
      setUploadState('error');
      setUploadMessage('Tipo de arquivo não permitido. Envie PDF, JPG, JPEG ou PNG.');
      return;
    }

    if (file.size > maxFileSizeBytes) {
      setSelectedFile(null);
      setSelectedFileName('');
      setUploadState('error');
      setUploadMessage('O arquivo deve ter até 10 MB.');
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setUploadState('idle');
    setUploadMessage('Arquivo selecionado.');
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

    if (schemaError) {
      setFormError('A tabela documents ainda não está configurada no Supabase para salvar documentos.');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);
    setUploadState('uploading');
    setUploadMessage('Enviando...');

    let nextFileUrl = form.fileUrl.trim() || null;
    let nextFileName = selectedFile?.name ?? null;

    if (selectedFile) {
      const storagePath = buildStoragePath(selectedFile);
      const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, selectedFile, {
        cacheControl: '3600',
        upsert: false,
      });

      if (uploadError) {
        setIsSubmitting(false);
        setUploadState('error');
        setUploadMessage('Não foi possível enviar o arquivo. Verifique se o bucket documents existe e se as políticas de Storage permitem upload.');
        return;
      }

      nextFileUrl = storagePath;
      nextFileName = selectedFile.name;

      if (editingDocumentId && form.fileUrl) {
        const previousPath = normalizeStoragePath(form.fileUrl);
        if (previousPath && previousPath !== storagePath) {
          await supabase.storage.from('documents').remove([previousPath]);
        }
      }

      setUploadState('success');
      setUploadMessage('Arquivo enviado com sucesso.');
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category || null,
      due_date: form.dueDate || null,
      file_url: nextFileUrl,
      name: nextFileName ?? null,
    };

    let error;
    if (editingDocumentId) {
      ({ error } = await supabase.from('documents').update(payload).eq('id', editingDocumentId));
    } else {
      ({ error } = await supabase.from('documents').insert([payload]));
    }

    setIsSubmitting(false);

    if (error) {
      if (selectedFile && nextFileUrl) {
        await supabase.storage.from('documents').remove([nextFileUrl]);
      }
      setUploadState('error');
      setUploadMessage('Não foi possível salvar o documento. O arquivo enviado foi removido para evitar órfãos.');
      setFormError('Não foi possível salvar o documento no momento.');
      return;
    }

    setIsModalOpen(false);
    resetForm();
    await fetchDocuments();

    toast({
      title: editingDocumentId ? 'Documento editado' : 'Documento criado',
      description: editingDocumentId
        ? 'As alterações foram salvas com sucesso.'
        : 'O documento foi cadastrado com sucesso.',
    });
  }

  function handleOpenDeleteModal(document: DocumentRecord) {
    setDocumentToDelete(document);
    setIsDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!documentToDelete?.id) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setIsSubmitting(true);

    const storagePath = normalizeStoragePath(documentToDelete.file_url ?? documentToDelete.url ?? null);
    const { error } = await supabase.from('documents').delete().eq('id', documentToDelete.id);

    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Não foi possível excluir o documento',
        description: 'Tente novamente em instantes.',
      });
      return;
    }

    if (storagePath) {
      await supabase.storage.from('documents').remove([storagePath]);
    }

    setIsDeleteModalOpen(false);
    setDocumentToDelete(null);
    await fetchDocuments();

    toast({
      title: 'Documento excluído',
      description: 'O documento foi removido com sucesso.',
    });
  }

  async function handleOpenDocument(document: DocumentRecord) {
    const documentUrl = getDocumentUrl(document);

    if (!documentUrl) {
      toast({
        title: 'Arquivo indisponível',
        description: 'Este documento ainda não possui um arquivo anexado.',
      });
      return;
    }

    if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
      window.open(documentUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(documentUrl, 60 * 60);

    if (error || !data?.signedUrl) {
      toast({
        title: 'Não foi possível abrir o arquivo',
        description: 'Verifique se o bucket documents e as policies de Storage estão configurados.',
      });
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const addedThisMonth = documents.filter((document) => {
      if (!document.created_at) {
        return false;
      }

      const createdAt = new Date(String(document.created_at));
      return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
    }).length;

    const importantDocuments = documents.filter((document) => {
      const category = document.category?.toLowerCase() ?? '';
      return category === 'financeiro' || category === 'contratos';
    }).length;

    const nearDueDocuments = documents.filter((document) => getDueSoonStatus(document) === 'soon').length;

    return {
      totalCount: documents.length,
      addedThisMonth,
      importantDocuments,
      nearDueDocuments,
    };
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = documents.filter((document) => {
      const title = getDocumentTitle(document).toLowerCase();
      const description = (document.description ?? '').toLowerCase();
      const matchesSearch = !normalizedSearch || title.includes(normalizedSearch) || description.includes(normalizedSearch);
      const matchesCategory = filterCategory === 'all' || (document.category ?? 'Outros') === filterCategory;

      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (sortOrder === 'name_asc') {
        return getDocumentTitle(a).localeCompare(getDocumentTitle(b), 'pt-BR');
      }

      if (sortOrder === 'name_desc') {
        return getDocumentTitle(b).localeCompare(getDocumentTitle(a), 'pt-BR');
      }

      if (sortOrder === 'oldest') {
        const aTime = a.created_at ? Date.parse(String(a.created_at)) : 0;
        const bTime = b.created_at ? Date.parse(String(b.created_at)) : 0;
        return aTime - bTime;
      }

      const aTime = a.created_at ? Date.parse(String(a.created_at)) : 0;
      const bTime = b.created_at ? Date.parse(String(b.created_at)) : 0;
      return bTime - aTime;
    });
  }, [documents, filterCategory, searchTerm, sortOrder]);

  const hasActiveFilters = searchTerm.trim() !== '' || filterCategory !== 'all' || sortOrder !== 'recent';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Documentos</h2>
          <p className="text-sm text-muted-foreground">Centralize arquivos e documentos importantes</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleOpenCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Documento
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.totalCount}</div>
            <p className="text-sm text-muted-foreground">Documentos cadastrados</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Adicionados este mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.addedThisMonth}</div>
            <p className="text-sm text-muted-foreground">Últimos 30 dias</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Documentos importantes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.importantDocuments}</div>
            <p className="text-sm text-muted-foreground">Categorias financeiras ou contratos</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vencimento próximo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{metrics.nearDueDocuments}</div>
            <p className="text-sm text-muted-foreground">Próximos 7 dias</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar documentos..."
            className="pl-9"
          />
        </div>
        <div className="w-full space-y-2 lg:w-56">
          <Label htmlFor="category-filter">Categoria</Label>
          <select
            id="category-filter"
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value as typeof filterCategory)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="all">Todas</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full space-y-2 lg:w-56">
          <Label htmlFor="sort-order">Ordenar por</Label>
          <select
            id="sort-order"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="name_asc">Nome A-Z</option>
            <option value="name_desc">Nome Z-A</option>
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

      {schemaError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          {schemaError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando documentos...</div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            {documents.length === 0 ? 'Você ainda não possui documentos cadastrados.' : 'Nenhum documento encontrado.'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {documents.length === 0
              ? 'Cadastre seus primeiros documentos assim que a tabela documents estiver disponível no Supabase.'
              : 'Tente ajustar a pesquisa ou os filtros para encontrar o que procura.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {documents.length > 0 ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : null}
            <Button type="button" onClick={handleOpenCreateModal}>
              + Novo Documento
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredDocuments.map((document) => {
            const dueStatus = getDueSoonStatus(document);
            const documentUrl = getDocumentUrl(document);
            return (
              <Card key={document.id ?? getDocumentTitle(document)} className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base font-semibold text-foreground">{getDocumentTitle(document)}</CardTitle>
                        <CardDescription className="mt-1 text-sm text-muted-foreground">
                          {document.category ?? 'Sem categoria'}
                        </CardDescription>
                      </div>
                    </div>
                    {dueStatus === 'overdue' ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-medium text-red-500">Vencido</span>
                    ) : dueStatus === 'soon' ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-500">Próximo do vencimento</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {document.description ? <p className="text-sm text-muted-foreground">{document.description}</p> : null}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">Criado:</span> {formatDate(document.created_at)}
                    </span>
                    {document.due_date ? (
                      <span>
                        <span className="font-medium text-foreground">Vencimento:</span> {formatDate(document.due_date)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {documentUrl ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleOpenDocument(document)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar arquivo
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenEditModal(document)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleOpenDeleteModal(document)}>
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
            <DialogTitle>{editingDocumentId ? 'Editar documento' : 'Novo documento'}</DialogTitle>
            <DialogDescription>
              {editingDocumentId ? 'Atualize os dados do documento.' : 'Cadastre um novo documento na central.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</div> : null}

            <div className="space-y-2">
              <Label htmlFor="document-title">Título</Label>
              <Input id="document-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Contrato de locação" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="document-description">Descrição</Label>
              <textarea
                id="document-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descreva o documento"
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="document-category">Categoria</Label>
                <select
                  id="document-category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-due-date">Data de vencimento</Label>
                <Input id="document-due-date" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="document-file">Arquivo</Label>
              <Input
                id="document-file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelection}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">Permitido: PDF, JPG, JPEG ou PNG. Tamanho máximo: 10 MB.</p>
              {selectedFileName ? (
                <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                  Arquivo selecionado: {selectedFileName}
                </div>
              ) : null}
              {uploadMessage ? (
                <div className={uploadState === 'error' ? 'text-sm text-red-500' : 'text-sm text-muted-foreground'}>
                  {uploadMessage}
                </div>
              ) : null}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => handleModalOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excluir documento</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este documento?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsDeleteModalOpen(false); setDocumentToDelete(null); }} disabled={isSubmitting}>
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
