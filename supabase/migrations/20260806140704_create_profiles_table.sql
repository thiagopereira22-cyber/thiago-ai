/*
# Criar tabela profiles para autenticação

## Objetivo
Cria a tabela `profiles` que armazena dados complementares do usuário,
vinculada à tabela interna `auth.users` do Supabase Auth. Esta tabela
é populada automaticamente quando um novo usuário se cadastra, através
de uma trigger function.

## Tabelas Criadas

### `profiles`
- `id` (uuid, primary key) — referência direta a `auth.users.id`
- `nome` (text, not null) — nome completo do usuário
- `email` (text, not null) — e-mail do usuário (espelha auth.users)
- `telefone` (text, nullable) — telefone de contato
- `empresa` (text, nullable) — nome da empresa do usuário
- `created_at` (timestamptz, default now()) — data de criação

## Funções Criadas

### `handle_new_user()`
Trigger function executada após INSERT em `auth.users`. Insere
automaticamente uma linha correspondente em `profiles` usando o
`id` e `email` do novo usuário autenticado.

## Triggers Criados
- `on_auth_user_created` — dispara `handle_new_user()` AFTER INSERT
  em `auth.users`.

## Segurança (RLS)
- RLS habilitado em `profiles`.
- Política SELECT: usuários autenticados podem ler apenas o próprio perfil.
- Política UPDATE: usuários autenticados podem atualizar apenas o próprio perfil.
- INSERT e DELETE não são expostos via RLS de cliente — a criação
  acontece exclusivamente via trigger no servidor.

## Notas
1. A coluna `id` é chave primária e chave estrangeira para `auth.users.id`
   com ON DELETE CASCADE, garantindo que o perfil seja removido quando
   o usuário é excluído.
2. A trigger garante que todo usuário criado via Supabase Auth tenha
   automaticamente um perfil correspondente, sem depender do cliente.
3. Email confirmation está desativado por padrão no projeto.
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

-- Função para criar perfil automaticamente quando um novo usuário se cadastra
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
