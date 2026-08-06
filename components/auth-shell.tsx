import { Sparkles } from 'lucide-react';

export function AuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Omnia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua vida organizada por uma única IA.
          </p>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 Omnia. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
