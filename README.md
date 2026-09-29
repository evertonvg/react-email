# E-mail Marketing (MJML)

Projeto para construir e-mails marketing em [MJML](https://mjml.io) e entregá-los ao cliente como pacotes `.zip` (`index.html` + `images/`), prontos para subir em qualquer plataforma de disparo (Mailchimp, RD Station, SendGrid etc.).

O MJML é uma linguagem de marcação que compila para HTML de e-mail: tabelas, estilos inline e hacks para Outlook, com responsividade automática.

## Requisitos

- Node.js **24+** (versão fixada no `.nvmrc`)
- npm

## Como levantar

```bash
nvm use          # usa o Node 24 definido no .nvmrc
npm install
npm run dev      # compila, observa alterações e abre servidor com live reload
```

Acesse **http://localhost:3000**. A página inicial lista os templates, e ao salvar qualquer `.mjml` ou imagem a página recarrega sozinha. Para usar outra porta: `PORT=4000 npm run dev`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Compila tudo, observa `templates/` e `components/`, serve em `localhost:3000` com live reload |
| `npm run build` | Compila todos os templates para `dist/` (mesma estrutura de `templates/`) |
| `npm run package` | Compila tudo e gera um `.zip` por template |
| `node scripts/build.js cliente-x/black-friday` | Compila só um template (aceita vários) |
| `node scripts/build.js cliente-x` | Compila todos os templates de um cliente |
| `node scripts/build.js cliente-x --zip` | Compila e empacota os templates do cliente |
| `node scripts/build.js --zip --cdn=https://cdn.exemplo.com/emails` | Troca `images/...` por URLs absolutas (`<cdn>/<caminho-do-template>/images/...`) |

## Estrutura

```
├── components/            # partes reutilizáveis (incluídas com <mj-include>)
│   ├── estilos.mjml       # <mj-attributes>: fontes, cores, classes
│   ├── header.mjml
│   └── footer.mjml
├── templates/
│   ├── exemplo/           # template de exemplo
│   └── <cliente>/         # pasta agrupadora por cliente
│       └── <campanha>/    # um e-mail por pasta
│           ├── index.mjml # fonte do e-mail
│           └── images/    # imagens usadas por este e-mail (aceita subpastas)
├── scripts/
│   ├── build.js           # compila, copia imagens, gera zip, watch
│   └── serve.js           # servidor local com live reload
└── dist/                  # saída gerada (ignorada no git), espelha templates/
    └── <cliente>/
        ├── <campanha>/index.html
        ├── <campanha>/images/
        └── <campanha>.zip
```

## Criando um novo e-mail

1. Crie `templates/<cliente>/<campanha>/index.mjml` (copie o `templates/exemplo/` como ponto de partida).
2. Coloque as imagens em `templates/<cliente>/<campanha>/images/`.
3. Rode `npm run dev` e acompanhe em `http://localhost:3000/<cliente>/<campanha>/`.
4. Quando estiver pronto: `node scripts/build.js <cliente>/<campanha> --zip` e envie o `dist/<cliente>/<campanha>.zip` ao cliente.

### Organização por cliente

Qualquer pasta que tenha um `index.mjml` é um template. Pastas sem ele são agrupadoras e o build procura dentro delas, em qualquer profundidade (`cliente-x/2026/black-friday` também funciona). Não coloque um `index.mjml` na pasta do cliente, senão ela vira um template e as subpastas deixam de ser procuradas.

No servidor de desenvolvimento, `http://localhost:3000/` lista todos os templates agrupados por cliente, e `http://localhost:3000/<cliente>/` lista só os daquele cliente.

Estrutura mínima de um template:

```xml
<mjml lang="pt-BR">
  <mj-head>
    <mj-title>Assunto do e-mail</mj-title>
    <mj-preview>Texto de prévia na caixa de entrada</mj-preview>
    <mj-include path="@components/estilos.mjml" />
  </mj-head>
  <mj-body background-color="#f4f4f4" width="600px">
    <mj-include path="@components/header.mjml" />

    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-image src="images/banner.png" alt="Descrição da imagem" width="600px" padding="0" />
        <mj-text>Conteúdo</mj-text>
        <mj-button href="https://exemplo.com">Chamada para ação</mj-button>
      </mj-column>
    </mj-section>

    <mj-include path="@components/footer.mjml" />
  </mj-body>
</mjml>
```

Layout em MJML: `mj-section` (linha) → `mj-column` (colunas lado a lado no desktop, empilhadas no celular) → conteúdo (`mj-text`, `mj-image`, `mj-button`, `mj-divider`, `mj-spacer`…). Referência completa dos componentes: https://documentation.mjml.io

## Estilos

O MJML estiliza por **atributos**, que viram estilos inline no build:

```xml
<mj-text color="#333" font-size="16px">Olá</mj-text>
```

Padrões globais e classes ficam em `components/estilos.mjml`:

```xml
<mj-attributes>
  <mj-all font-family="Arial, Helvetica, sans-serif" />   <!-- todos os componentes -->
  <mj-text font-size="16px" color="#333333" />            <!-- todo mj-text -->
  <mj-class name="titulo" font-size="28px" font-weight="bold" />
</mj-attributes>
```

```xml
<mj-text mj-class="titulo">Promoção</mj-text>
```

Para CSS de verdade use `<mj-style inline="inline">` (é aplicado em cada elemento no build). Sem `inline`, o CSS vai para um `<style>` no `<head>`, que alguns clientes (Gmail, Outlook) ignoram parcialmente.

## Componentes e aliases

Partes reutilizáveis ficam em `components/` e são incluídas com `<mj-include>`:

```xml
<mj-include path="@components/header.mjml" />
```

Aliases disponíveis (definidos em `ALIASES` no `scripts/build.js`):

| Alias | Pasta |
|---|---|
| `@components` | `components/` |
| `@templates` | `templates/` |

Caminhos relativos também funcionam (`../../components/header.mjml`).

Observações:

- `mj-include` **não aceita parâmetros**: o arquivo é copiado como está. Use-o para partes fixas (header, footer, estilos).
- Um componente pode ser só o trecho (`<mj-section>...`) ou vir envolto em `<mjml><mj-body>...</mj-body></mjml>`. Para incluir estilos no `<head>`, envolva em `<mjml><mj-head>...</mj-head></mjml>`.
- Imagens dentro de componentes usam caminho relativo **ao template**, não ao componente (`src="images/logo.png"` → `templates/<cliente>/<campanha>/images/logo.png`).
- Por segurança, só é permitido incluir arquivos de `templates/` e `components/`. Includes fora disso são bloqueados e o build mostra um aviso.

## Imagens

- Use `src="images/arquivo.png"`: o build copia a pasta `images/` do template (com subpastas) para `dist/` e para o zip.
- Sempre preencha `alt`: muitos clientes bloqueiam imagens por padrão.
- Exporte em ~2x a largura exibida (ex.: 1200px para 600px) para ficar nítido em telas retina, mas mantenha cada imagem idealmente abaixo de ~100 KB.
- Se a plataforma do cliente não hospedar as imagens do zip, suba-as num CDN e gere com `--cdn=<url>`.

## Como o build funciona

`scripts/build.js` procura todas as pastas com `index.mjml` dentro de `templates/` e, para cada uma:

1. Resolve os aliases de `mj-include` e compila com o MJML.
2. Mostra avisos de validação (atributos inválidos, includes bloqueados, alias desconhecido).
3. Grava `dist/<caminho>/index.html` e copia `images/` (arquivos ocultos como `.gitkeep` são ignorados).
4. Com `--cdn`, reescreve `src`/`href`/`background` que começam com `images/`.
5. Com `--zip`, gera `dist/<caminho>.zip` com `index.html` e `images/` na raiz.

No `npm run dev`, `scripts/serve.js` serve a pasta `dist/` e injeta um pequeno script de live reload **somente na resposta do servidor**. O `index.html` gerado e o zip não contêm esse script.

## Visualização e testes

- **Navegador:** `npm run dev` (recomendado).
- **VS Code:** extensão *MJML* (`attilabuti.vscode-mjml`) → "MJML: Open Preview to the side". Atenção: ela **não entende os aliases** `@components`, então header/footer não aparecem nessa prévia.
- **Clientes de e-mail reais:** antes de entregar, teste no Litmus, Email on Acid ou Mailtrap, ou envie para você mesmo e abra no Gmail, no Outlook e no celular.

## Limitações conhecidas

- Os aliases funcionam em Linux e macOS, mas não no Windows (o MJML 5 recusa caminhos absolutos em `mj-include`, e o alias é convertido num caminho relativo até a raiz do disco).
- No MJML 5 os includes vêm desativados por padrão; o build os habilita (`ignoreIncludes: false`). Se compilar os arquivos por outra ferramenta, os includes podem ser ignorados silenciosamente.
