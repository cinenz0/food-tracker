# Food Tracker

Aplicativo de alimentação para Windows: refeições, calorias, proteína, receitas e metas. Janela própria em vermelho vinho, com controles personalizados. Diário offline e assistente Gemini opcional.

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

Em **Metas e backup**, cole uma chave do Google AI Studio. O app usa Gemini 3.5 Flash-Lite sem pesquisa web e devolve uma estimativa curta, identificada como sem fonte verificada. A chave fica protegida pelo Windows DPAPI, fora dos backups alimentares. Só a descrição digitada é enviada ao Google; na faixa gratuita, esses dados podem melhorar os produtos Google.

Use projeto Free Tier sem faturamento se quiser manter o uso gratuito. O aplicativo não consegue verificar o plano do projeto e não ativa cobrança, repete automaticamente chamadas ou troca de provedor.

## Desenvolvimento

Python 3.12+, HTML/CSS/JavaScript, SQLite, pywebview/WebView2 e PyInstaller.

```powershell
./build.ps1
./install.ps1
```

O build gera `dist/Food Tracker.exe`. Para desenvolvimento da janela nativa: `.venv/Scripts/python.exe desktop.py`. O modo navegador continua disponível com `python -B app.py`; nesse modo os dados ficam em `data/` e é necessário usar Encerrar aplicativo para desligar o servidor.

```powershell
python -B -m unittest test_core -v
Get-Content test_portions.js -Raw | node
Get-Content ui/app.js -Raw | node --check
```

O pacote inclui apenas código, interface e um cadastro de exemplo. Diretórios de dados, chaves, backups e notas pessoais ficam fora do versionamento. O executável não possui assinatura digital de editor.
