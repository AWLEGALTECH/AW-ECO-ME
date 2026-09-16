-- O emoji do aviso de lead novo: 🌱 virou 📩.
--
-- A plantinha dizia "algo nasceu", que é bonito e é a coisa errada: o que
-- aconteceu foi CHEGAR ALGUÉM, e o sino é lido de relance, pelo emoji, antes do
-- texto. 📩 diz "chegou" e não repete nenhum dos que já existem no sino
-- (📁 pré-cliente, 📊 balanço, 🎫 chamado, 🎉 contrato assinado).
--
-- A migração anterior já foi corrigida na fonte, mas ela pode ter rodado antes
-- disso em outro ambiente; esta existe para deixar os dois no mesmo lugar.
update public.notificacao_config
   set titulo_template = 'Lead novo 📩'
 where tipo = 'lead_novo_na_base';
