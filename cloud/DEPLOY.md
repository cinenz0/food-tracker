# Publicação pessoal — iPhone e Windows

O código está preparado para Cloudflare Workers e Supabase. São necessários projetos nas suas contas; não é preciso comprar um domínio. Use planos gratuitos e mantenha o projeto Gemini sem faturamento se quiser limitar o uso ao Free Tier.

## 1. Supabase

- Crie um projeto Free na sua conta e guarde a senha do banco em seu gerenciador de senhas.
- No SQL Editor, execute `cloud/schema.sql`. A operação cria as tabelas e funções com isolamento por usuário; não importa registros pessoais.
- Em Authentication, desative cadastro público. Crie sua conta de acesso em Users, com e-mail e senha definidos por você. Não envie a senha no chat nem a coloque no Git.
- Copie o UUID desse usuário e execute a instrução de autorização ao final do schema: `insert into public.food_tracker_members(user_id) values ('SEU_UUID');`.
- Anote a URL do projeto e a chave pública `anon`/publishable. Não use `service_role` ou secret key do Supabase: o servidor deve operar com a sessão do usuário e respeitar as regras do banco.

## 2. Cloudflare

Na raiz do repositório, com Node.js 22+:

```powershell
npm ci
npx wrangler login
./cloud/deploy.ps1 -SupabaseUrl https://SEU_PROJETO.supabase.co -SupabaseAnonKey SUA_CHAVE_PUBLICA -OwnerEmail SEU_EMAIL
```

O script publica o serviço e envia os quatro valores de configuração como segredos, pela entrada padrão. Reaproveita a chave Gemini protegida do Food Tracker instalado na conta Windows; se não houver uma, pede entrada protegida. Não grava a chave em arquivo ou código-fonte. A interface só fica funcional após banco, usuário autorizado e segredos estarem configurados.

O Worker atende interface, login e APIs no mesmo domínio HTTPS. Sessões usam cookies HttpOnly, Secure e SameSite=Strict. Não habilite CORS aberto. As tabelas têm RLS, e as funções autorizam explicitamente o usuário cadastrado. Fotos e descrições não são registradas nos logs do app. A foto é enviada ao Gemini com `store:false`; isso não altera as políticas de uso/retenção do Google para a faixa gratuita.

## 3. Migrar sem perder o diário

1. No app Windows atual, exporte um backup em Metas e backup. Preserve também a pasta `%LOCALAPPDATA%/FoodTracker/data`.
2. Entre no endereço HTTPS publicado e restaure esse backup em Metas e backup. Confira alimentos, metas, dias e totais; espere o indicador Tudo sincronizado.
3. Não use simultaneamente a versão local antiga para registrar novos dados: ela é uma cópia independente e não sincroniza automaticamente.
4. Gere/instale a nova versão Windows apontando para o mesmo endereço:

```powershell
./build.ps1
./install.ps1 -CloudUrl https://food-tracker.SEU_SUBDOMINIO.workers.dev
```

O executável passa a abrir a versão sincronizada. A cópia SQLite original permanece intacta. Para acessá-la explicitamente, execute `Food Tracker.exe --local`; alterações nesse modo ficam somente nela. O login da versão sincronizada é separado da sessão do Safari.

## 4. iPhone

Abra o endereço no Safari, entre e use Compartilhar → Adicionar à Tela de Início. Ative Abrir como App da Web, se aparecer. Faça o primeiro acesso conectado. Depois disso, cadastros e diário ficam disponíveis no armazenamento do app e registros manuais podem ser feitos sem internet. Sincronização ocorre ao abrir/reconectar; o iPhone não garante execução contínua em segundo plano.

Ao usar fotos, é necessário estar conectado. O app reduz e recodifica a imagem para JPEG antes do envio, removendo metadados da imagem original. Nenhuma foto é guardada no banco ou no cache offline. A IA pode pedir detalhes e sempre exige confirmação antes de registrar. HEIC depende da decodificação do navegador; quando não for possível, o app pede outra foto/JPEG.

## Validação e limites

```powershell
npm test
npm run test:database
npm run build:cloud
python -B -m unittest test_core -v
```

Os testes usam dados fictícios. A validação final exige seu projeto real e seu iPhone: entrar, migrar backup, registrar nos dois aparelhos, conferir conflito, testar sem internet e estimar uma foto de refeição. O limite do app é 30 consultas IA por dia UTC, com intervalo mínimo de 5 segundos; as cotas do Google também se aplicam. O Supabase Free pode pausar projetos por baixa atividade. Se a hospedagem ficar indisponível, registros locais permanecem pendentes; não saia da conta ou apague o armazenamento antes de sincronizar/exportar.

Para atualizar a PWA, feche suas janelas e reabra após a nova versão ser baixada. O service worker não força recarga durante um formulário aberto. Exclusões sincronizadas usam marcadores; alterações simultâneas no mesmo registro exigem escolha explícita. A restauração guarda a versão anterior no aparelho e oferece download nas configurações.
