# Thiago AI — Módulo de Autenticação

## Visão Geral

Implementação completa do módulo de autenticação do Thiago AI utilizando
Supabase Auth com sessões baseadas em cookies (SSR-safe). O fluxo cobre
login, recuperação de senha, cadastro de novos usuários, proteção de
rotas via middleware e tabela `profiles` com criação automática via trigger.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL
- `@supabase/ssr` (cookie-based sessions)

## Arquitetura

```
lib/
  supabase-browser.ts        → Cliente Supabase para browser
  supabase-server.ts          → Cliente Supabase para server components
  supabase-client.ts          → Re-export do browser client (compat)

services/
  auth-service.ts             → Toda a lógica de autenticação
                                (signIn, signUp, resetPassword, signOut,
                                 getCurrentUser, getProfile, onAuthStateChange)

hooks/
  auth-context.ts             → Definição do contexto + tipos
  use-auth.ts                  → Hook useAuth() para consumir o contexto
  use-toast.ts                 → Hook de toast (pré-existente)

components/
  providers.tsx               → AuthProvider (provider do contexto React)
  auth-shell.tsx              → Layout visual reutilizável das telas de auth
  sidebar.tsx                 → Menu lateral com logout e dados do perfil
  topbar.tsx                  → Barra superior

middleware.ts                 → Proteção de rotas + refresh de sessão

app/
  layout.tsx                  → Root layout com AuthProvider
  page.tsx                    → Redirect server-side baseado em auth
  login/page.tsx              → Tela de login (email + senha)
  forgot-password/page.tsx    → Tela de recuperação de senha
  solicitar-acesso/page.tsx   → Tela de cadastro
  dashboard/layout.tsx        → Guard server-side no dashboard
```

## Fluxo de Autenticação

1. **Login** (`/login`): `authService.signIn()` → `supabase.auth.signInWithPassword()`.
2. **Cadastro** (`/solicitar-acesso`): `authService.signUp()` → `supabase.auth.signUp()`
   com `user_metadata.nome`, seguido de upsert na tabela `profiles` com
   telefone e empresa.
3. **Recuperação de senha** (`/forgot-password`): `authService.resetPassword()` →
   `supabase.auth.resetPasswordForEmail()` envia link de redefinição que
   redireciona para `/login`.
4. **Logout**: `authService.signOut()` → `supabase.auth.signOut()` via botão na sidebar.

## Proteção de Rotas

### Middleware (`middleware.ts`)
- **Rotas públicas**: `/login`, `/forgot-password`, `/solicitar-acesso`.
- **Rotas protegidas**: tudo sob `/dashboard/*`.
- Usuário não autenticado em rota protegida → redirect para `/login?redirect=...`.
- Usuário autenticado em rota pública → redirect para `/dashboard`.
- Raiz `/` → redirect baseado em estado de autenticação.
- O middleware usa `createServerClient` do `@supabase/ssr` para refresh
  automático do token de sessão nos cookies.

### Server-side guard (`dashboard/layout.tsx`)
- Verifica `supabase.auth.getUser()` no server component.
- Se não houver usuário, redireciona para `/login`.
- Carrega o perfil do usuário da tabela `profiles`.

### Client-side (`AuthProvider` + `useAuth`)
- `onAuthStateChange` mantém o estado de usuário sincronizado.
- Disponibiliza: `user`, `profile`, `loading`, `signOut`, `refreshProfile`.

## Migration SQL

### Nome: `create_profiles_table`

```sql
/*
# Criar tabela profiles para autenticação

## Objetivo
Cria a tabela `profiles` que armazena dados complementares do usuário,
vinculada à tabela interna `auth.users` do Supabase Auth. Populada
automaticamente quando um novo usuário se cadastra, via trigger.

## Tabela: profiles
- id (uuid, PK, FK → auth.users.id, ON DELETE CASCADE)
- nome (text, not null)
- email (text, not null)
- telefone (text, nullable)
- empresa (text, nullable)
- created_at (timestamptz, default now())

## Função: handle_new_user()
SECURITY DEFINER — insere linha em profiles após INSERT em auth.users.

## Trigger: on_auth_user_created
AFTER INSERT ON auth.users → executa handle_new_user().

## RLS
- SELECT: auth.uid() = id (usuário lê apenas próprio perfil)
- UPDATE: auth.uid() = id (usuário atualiza apenas próprio perfil)
- INSERT/DELETE não expostos via RLS de cliente (apenas via trigger)
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  empresa text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

## Variáveis de Ambiente

As seguintes variáveis já estão configuradas no arquivo `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Configurações Manuais no Supabase

**Nenhuma configuração manual é obrigatória.** A migration foi aplicada
automaticamente e as variáveis de ambiente já estão no `.env`.

Configurações opcionais (recomendadas):

1. **Painel do Supabase → Authentication → Sign In / Providers**:
   confirmar que **Email** está habilitado.

2. **Painel do Supabase → Authentication → Email Templates**:
   customizar o template de redefinição de senha com a identidade visual
   do Thiago AI.

3. **Email confirmation**: está **desativado** por padrão (convenção do
   projeto). Se desejar ativar, faça no painel e ajuste o fluxo de cadastro
   para exibir uma mensagem de confirmação.

## Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `services/auth-service.ts` | Camada de serviço com toda a lógica de auth |
| `hooks/auth-context.ts` | Definição do contexto e tipos de autenticação |
| `hooks/use-auth.ts` | Hook `useAuth()` para consumir o contexto |
| `app/forgot-password/page.tsx` | Tela de recuperação de senha |
| `README_AUTH.md` | Esta documentação |

## Arquivos Alterados

| Arquivo | Alteração |
|---------|-----------|
| `components/providers.tsx` | Refatorado para usar `authService` e `AuthContext` |
| `components/sidebar.tsx` | Import de `useAuth` movido para `@/hooks/use-auth` |
| `app/login/page.tsx` | Usa `authService`; link aponta para `/forgot-password` |
| `app/solicitar-acesso/page.tsx` | Usa `authService` |
| `middleware.ts` | Rota pública `/esqueci-senha` → `/forgot-password` |

## Arquivos Removidos

| Arquivo | Motivo |
|---------|--------|
| `app/esqueci-senha/page.tsx` | Substituído por `app/forgot-password/page.tsx` |
| `docs/TAREFA-1-AUTENTICACAO.md` | Substituído por `README_AUTH.md` |
