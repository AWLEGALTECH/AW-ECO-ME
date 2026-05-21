// Patch runtime pro bug histórico "Cannot set property namespaceURI" do
// docxtemplater-image-module-free em browsers modernos. Alguns browsers
// têm Element.prototype.namespaceURI como getter-only e a lib tenta atribuir
// valor diretamente. Interceptamos a criação de elements pra retornar objetos
// onde namespaceURI é gravável.
//
// Baseado em https://github.com/evilc0des/docxtemplater-image-module-free/issues/1
  // Patch runtime pro bug histórico "Cannot set property namespaceURI" do
  // docxtemplater-image-module-free em browsers modernos.
  // Alguns browsers têm Element.prototype.namespaceURI como getter-only e a lib
  // tenta atribuir valor diretamente. Interceptamos a criação de elements pra
  // retornar objetos onde namespaceURI é gravável.
  //
  // Baseado em https://github.com/evilc0des/docxtemplater-image-module-free/issues/1
  (function() {
    if (typeof window === 'undefined') return;
    // Sobrescreve o getter/setter de namespaceURI pra permitir escrita
    try {
      const proto = Element.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'namespaceURI');
      if (desc && desc.get && !desc.set) {
        // Remove o descritor só-leitura; instala um que aceita escrita.
        // Não podemos redefinir o prototype, mas podemos usar uma flag interna.
        Object.defineProperty(proto, 'namespaceURI', {
          get: function() { return this.__customNsURI || desc.get.call(this); },
          set: function(v) { this.__customNsURI = v; },
          configurable: true,
        });
      }
    } catch (e) {
      console.warn('Não foi possível aplicar patch de namespaceURI:', e);
    }
  })();
