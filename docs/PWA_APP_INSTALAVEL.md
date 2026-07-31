# App instalável — PWA

A versão 4.7 já vem configurada como PWA com:

- `manifest.webmanifest` vinculado no `index.html`;
- ícones para Android, iPhone e computador;
- `apple-touch-icon` para iOS;
- `service worker` atualizado;
- botão **Instalar como aplicativo** no login e no cabeçalho interno.

## Como instalar no Android

1. Acesse o sistema pelo endereço publicado no Cloudflare Pages, usando HTTPS.
2. Toque em **Instalar como aplicativo**.
3. Quando o navegador abrir a janela de instalação, confirme.

Também é possível abrir o menu do Chrome e escolher **Instalar app** ou **Adicionar à tela inicial**.

## Como instalar no iPhone

O iOS não permite que sites instalem o app automaticamente por botão. O botão do sistema mostra a orientação correta.

No iPhone:

1. Abra o sistema no Safari.
2. Toque no botão **Compartilhar**.
3. Toque em **Adicionar à Tela de Início**.
4. Confirme o nome do app.

## Teste local

Para a instalação automática aparecer em teste local, use:

```txt
http://127.0.0.1:8788
```

Evite testar instalação automática por IP da rede local, como:

```txt
http://192.168.0.11:8788
```

Nesse caso, o navegador pode bloquear o instalador porque não considera a página um ambiente seguro.

## Publicação no Cloudflare

No Cloudflare Pages, o sistema usa HTTPS automaticamente. Após publicar, limpe o cache do navegador ou reinstale o app antigo para garantir que o ícone e a logo novos apareçam.
