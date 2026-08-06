import { User, Bell, Shield, Palette, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Configurações
        </h2>
        <p className="text-sm text-muted-foreground">
          Gerencie suas preferências e dados da conta
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Perfil
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Atualize suas informações pessoais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Nome</Label>
              <Input defaultValue="Thiago" className="border-border bg-secondary" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">E-mail</Label>
              <Input
                type="email"
                defaultValue="thiago@thiagoai.com"
                className="border-border bg-secondary"
              />
            </div>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Salvar alterações
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Notificações
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Configure como você recebe alertas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Notificações por e-mail', desc: 'Receba atualizações no seu e-mail' },
              { label: 'Alertas de licitação', desc: 'Seja avisado de novas oportunidades' },
              { label: 'Resumo diário', desc: 'Receba um resumo das atividades do dia' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Segurança
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Proteja sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Senha atual</Label>
              <Input type="password" placeholder="••••••••" className="border-border bg-secondary" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Nova senha</Label>
              <Input type="password" placeholder="••••••••" className="border-border bg-secondary" />
            </div>
            <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
              Atualizar senha
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Aparência
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Personalize a interface do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Tema escuro</p>
                <p className="text-xs text-muted-foreground">Ativar modo escuro</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Animações
                </p>
                <p className="text-xs text-muted-foreground">
                  Ativar transições suaves
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Idioma
                </p>
                <p className="text-xs text-muted-foreground">
                  Português (Brasil)
                </p>
              </div>
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
