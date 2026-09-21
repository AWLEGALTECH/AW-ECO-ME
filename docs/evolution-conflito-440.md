# Evolution: conflito de sessão (440) ao trocar foto, nome ou privacidade

**Data:** 21/09/2026. **Número afetado:** PORTAL DIREITO ABERTO 2.

## O que aconteceu

1. 17:00 (hora de Manaus): a foto de perfil do PORTAL DIREITO ABERTO 2 foi
   trocada pela plataforma (`chat/updateProfilePicture`). A foto entrou.
2. No mesmo segundo, o webhook passou a receber `connection.update` sem parar:
   cerca de 2.000 eventos em 20 minutos, depois um silêncio com o painel
   dizendo "conectado" e todo envio voltando `Connection Closed` (ou `1006`).
3. 17:51: um `instance/restart` reacendeu o loop, que durou horas. No
   `wa_eventos`, o padrão é sempre o mesmo: `connecting`, `open`, `close` com
   `statusReason: 440`, e de novo, a cada dois segundos.

`440` é `DisconnectReason.connectionReplaced`: **duas sessões com a mesma
credencial**, e o WhatsApp derruba uma quando a outra entra.

## Por que acontece (código da Evolution, `main` em 21/09/2026, v2.3.7)

`src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`:

```ts
public async reloadConnection(): Promise<WASocket> {
  try {
    return await this.createClient(this.phoneNumber);   // abre um socket novo...
  } catch (error) { ... }
}
```

`createClient` faz `this.client = makeWASocket(...)` e **não fecha o socket
anterior**. O antigo continua vivo, com os mesmos handlers. Quem chama
`reloadConnection`:

- `updateProfilePicture` (linha ~4092)
- `removeProfilePicture` (linha ~4104)
- `updatePrivacySettings` (linha ~4003)

Resultado: dois sockets, uma credencial. O WhatsApp fecha um com 440; o
handler de `connection.update` desse socket vê `close` com código que não está
em `codesToNotReconnect` (`loggedOut`, `forbidden`, 402, 406) e chama
`connectToWhatsapp`, que cria um TERCEIRO socket. O outro cai com 440 e faz o
mesmo. É um loop que só termina quando o WhatsApp começa a recusar (428, 503)
ou quando todas as sessões são derrubadas de uma vez.

O `instance/restart` antigo tem o mesmo defeito (`client.end()` dispara o
handler de `close`, que reconecta, e o controller reconecta de novo). A `main`
atual já prefere `instance.restart()` quando existe, mas `reloadConnection`
continua igual.

## Como sair do loop (operação)

Reiniciar a instância **não resolve**: é a mesma coisa de novo. Duas saídas:

1. **Pelo celular do número:** WhatsApp, Dispositivos conectados, sair da
   sessão da Evolution. Isso invalida a credencial: todos os sockets recebem
   `loggedOut` e param. Depois, conectar de novo pelo QR na engrenagem do AW.
2. **Pelo servidor:** reiniciar o processo/container da Evolution. Todas as
   instâncias reconectam do zero com a credencial salva, sem QR. Pisca os
   números dos outros escritórios por meio minuto.

## Correção na Evolution (patch)

Fechar o socket antigo antes de abrir o novo, e tirar os handlers dele antes,
para o `end()` não disparar uma reconexão:

```diff
   public async reloadConnection(): Promise<WASocket> {
     try {
+      // Fecha o socket antigo ANTES de abrir o novo. Sem isto, os dois ficam
+      // vivos com a mesma credencial e o WhatsApp derruba um quando o outro
+      // entra (statusReason 440), em loop.
+      const antigo = this.client;
+      if (antigo) {
+        antigo.ev?.removeAllListeners?.();
+        antigo.ws?.close?.();
+        try { antigo.end?.(undefined); } catch { /* já fechado */ }
+      }
       return await this.createClient(this.phoneNumber);
     } catch (error) {
```

Alternativa mais conservadora: remover as três chamadas a
`this.reloadConnection()` em `updateProfilePicture`, `removeProfilePicture` e
`updatePrivacySettings`. O Baileys aplica as três mudanças com a sessão de pé;
o reload existia só para renovar dados em cache (a URL da foto), e o AW já lê a
foto nova ao vivo pelo `chat/fetchProfilePictureUrl`.

### Aplicar

A Evolution roda de imagem pronta (`evoapicloud/evolution-api` ou
`atendai/evolution-api`), então o patch pede build próprio:

```bash
git clone --depth 1 --branch v2.3.7 https://github.com/EvolutionAPI/evolution-api.git
cd evolution-api
# aplicar o diff acima em src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts
docker build -t evolution-api:2.3.7-sem-440 .
# trocar a imagem no docker-compose e subir de novo
```

### Verificar

- No AW, a engrenagem do número deixa de mostrar "em conflito" 10 minutos
  depois do último 440 com a sessão aberta (`fn_wa_conexao`).
- Trocar a foto e conferir no `wa_eventos`: deve haver um `close` do socket
  antigo (sem 440), um `connecting` e um `open`, e mais nada.

## O que o AW faz hoje por conta disso

- O webhook trata `connection.update` e a função `fn_wa_conexao` marca
  `wa_instancias.conflito_desde` com 3 ou mais quedas 440 em 3 minutos. A
  tela mostra "em conflito" (âmbar) com o passo a passo acima.
- "Reiniciar o número" recusa enquanto o conflito durar.
- A `wa-perfil` sonda o socket antes de mexer e explica o caminho em vez de
  gastar tentativas; depois de aplicar, sonda de novo e avisa alto se a
  conexão ficou em conflito.
- Trocar e tirar a foto pela plataforma pedem confirmação com o aviso, até a
  Evolution ser corrigida.
