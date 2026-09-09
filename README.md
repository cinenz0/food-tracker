# Food Tracker

Aplicativo pessoal de alimentação para iPhone e Windows: refeições, calorias, proteína, receitas, metas, sincronização e estimativas por foto. A versão móvel é uma aplicação web instalável pelo Safari; a versão Windows usa uma janela própria em vermelho vinho.

## iPhone e sincronização

A versão hospedada funciona no Safari e pode ser instalada pela opção **Compartilhar → Adicionar à Tela de Início**. Ela mantém uma cópia local do diário para consulta e registros manuais sem internet, sincronizando ao voltar à rede. O iPhone não garante sincronização contínua em segundo plano, então o envio ocorre ao abrir ou retornar ao aplicativo.

O login é pessoal e o banco usa isolamento por usuário. Registros feitos em aparelhos diferentes são combinados por item. Quando o mesmo registro é alterado nos dois aparelhos, o aplicativo mostra as duas versões para você escolher, sem apagar mudanças silenciosamente.

Consulte [cloud/DEPLOY.md](cloud/DEPLOY.md) para configurar Supabase, Cloudflare, migrar o diário atual e apontar o executável Windows para o mesmo endereço.

## Registrar por foto

No Diário, use **Registrar por foto**, tire ou escolha uma imagem e informe detalhes opcionais. A foto é reduzida e recodificada no aparelho antes do envio, removendo os metadados da imagem original. O Gemini identifica os alimentos e estima porções, calorias e proteína. Você pode ajustar cada quantidade, reaproveitar referências já cadastradas e só então registrar a refeição.

A foto é enviada ao Google apenas quando você solicita a análise e não é guardada no banco ou no cache offline. A estimativa pode errar peso, óleo e ingredientes ocultos; o resultado sempre aparece para revisão. O app limita o uso a 30 consultas por dia e cinco segundos entre chamadas, além das cotas da chave Gemini.

## Instalar

1. Baixe **Food Tracker.exe** na seção Releases deste repositório.
2. Abra com dois cliques. Não precisa instalar Python; requer Windows 10/11 de 64 bits e Microsoft Edge WebView2 Runtime.
3. Para criar um atalho, execute `install.ps1 -Executable "caminho/Food Tracker.exe"`. O executável vai para `%LOCALAPPDATA%/Programs/FoodTracker` e o atalho para a área de trabalho.

Os botões na parte superior minimizam, maximizam/restauram e fecham. Arraste a área do título para mover; dois cliques nela alternam a maximização. Fechar encerra o servidor local. Uma segunda abertura traz a janela existente à frente.

## Dados

O executável guarda banco, chave protegida e backups em **%LOCALAPPDATA%/FoodTracker/data**. Atualizações do executável preservam essa pasta. O pacote e o GitHub não incluem dados pessoais. O exemplo inicial e as metas são demonstrativos: ajuste-os nas configurações. Não representam uma recomendação nutricional.

Em **Metas e backup**, exporte ou restaure seus registros. Guarde uma cópia em outro disco. Os registros preservam as referências nutricionais usadas naquele momento; editar um cadastro não recalcula refeições anteriores.

## Registrar alimentos

Escolha a refeição, busque um alimento e informe a quantidade. A busca aceita, por exemplo, `150 g de macarrão cozido`. Quando há referência cadastrada, o cálculo é proporcional, sem duplicar o alimento. Preparos e marcas são apresentados para escolha. Novos cadastros em g/ml usam referência de 100 g/ml. Correspondência local considera nome, unidade e palavras; não resolve todos os sinônimos.

Receitas somam os ingredientes e dividem pelo rendimento. Dias completos entram nas médias; dias parciais ficam identificados. Proteína desconhecida não é tratada como zero conhecido.

## Assistente Gemini

No modo local, em **Metas e backup**, cole uma chave do Google AI Studio. Na versão sincronizada, a chave fica como segredo no servidor e não chega ao navegador. O app usa Gemini 3.5 Flash-Lite sem pesquisa web e devolve estimativas curtas, identificadas como sem fonte verificada. Na faixa gratuita, fotos e descrições enviadas podem melhorar os produtos Google.

Use projeto Free Tier sem faturamento se quiser manter o uso gratuito. O aplicativo não consegue verificar o plano do projeto e não ativa cobrança, repete automaticamente chamadas ou troca de provedor.

## Desenvolvimento

Python 3.12+, HTML/CSS/JavaScript, SQLite, pywebview/WebView2, PyInstaller, Cloudflare Workers e Supabase/PostgreSQL.

```powershell
./build.ps1
./install.ps1
```

O build gera `dist/Food Tracker.exe`. Para desenvolvimento da janela nativa: `.venv/Scripts/python.exe desktop.py`. O modo navegador continua disponível com `python -B app.py`; nesse modo os dados ficam em `data/` e é necessário usar Encerrar aplicativo para desligar o servidor.

```powershell
python -B -m unittest test_core -v
Get-Content test_portions.js -Raw | node
Get-Content ui/app.js -Raw | node --check
npm test
npm run test:database
npm run build:cloud
```

O pacote inclui apenas código, interface e um cadastro de exemplo. Diretórios de dados, chaves, backups e notas pessoais ficam fora do versionamento. O executável não possui assinatura digital de editor.
