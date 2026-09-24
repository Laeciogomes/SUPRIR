# SUPRIR Educação como aplicativo — PWA

A V5.1 permanece configurada como PWA:

- `manifest.webmanifest` vinculado ao `index.html`;
- nome do aplicativo: **SUPRIR Educação — Canindé**;
- nome curto: **SUPRIR**;
- ícones para Android, iPhone e computador;
- `apple-touch-icon` para iOS;
- service worker com cache próprio da V5.1;
- botão de instalação no login e no cabeçalho interno.

## Android / computador

Acesse o endereço HTTPS publicado no Cloudflare Pages e use **Instalar app**. O navegador também pode oferecer a instalação pelo próprio menu.

## iPhone

1. Abra o sistema no Safari.
2. Toque em **Compartilhar**.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme.

## Atualização da V4.x para V5.1

O cache da V5.1 usa a chave `suprir-educacao-v5-1-0`. Caso um aparelho continue exibindo a interface anterior, remova/reinstale o PWA ou limpe dados do site/service worker.
