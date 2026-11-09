# Arquitetura, Domínios de Autoridade, Sincronização Local/Nuvem e Segurança

## 1. Visão Geral da Arquitetura Híbrida (Rede Local Wi-Fi + Nuvem)

O **Mesa Viva** foi projetado com arquitetura híbrida **Edge-First + Cloud Sync** para garantir continuidade operacional de 100% no salão, cozinha e frente de caixa mesmo durante quedas do link de internet (WAN):

1. **Servidor Operacional Local (Edge Server na LAN/Wi-Fi)**:
   - Mantém o banco PostgreSQL operacional e o hub WebSocket/SignalR local.
   - Atende celulares dos clientes conectados ao Wi-Fi do estabelecimento, tablets dos garçons, monitores KDS da cozinha/bar/pizzaria e o terminal de caixa.
2. **Serviço Central em Nuvem (Cloud Central)**:
   - Recebe os eventos operacionais autenticados e reconciliados.
   - Permite administração remota, relatórios consolidados e atualização de catálogo.

---

## 2. Matriz de Autoridade de Dados e Resolução de Conflitos

A sincronização distribuída **não** é uma cópia cega de tabelas. Cada entidade possui um domínio de autoridade explícito:

| Entidade / Registro | Autoridade Primária | Identificador Global | Regra de Conflito e Idempotência |
| :--- | :--- | :--- | :--- |
| **Sessão de Mesa (`table_sessions`)** | Servidor Operacional Local | `SES-<UUIDv4>` | O servidor local detém autoridade exclusiva sobre abertura, rotação de PIN e revogação física da mesa. |
| **Pedidos e Itens (`orders`, `order_items`)** | Servidor Operacional Local | `ORD-<UUIDv4>` + `idempotency_key` (`UNIQUE`) | Imutabilidade do snapshot comercial (`unit_price_cents_snapshot`). Cliques repetidos ou reenvios na reconexão com a mesma `idempotency_key` são ignorados de forma idempotente. |
| **Pagamentos e Estornos (`payments`)** | Servidor Operacional Local | `PAY-<UUIDv4>` + `idempotency_key` (`UNIQUE`) | Lançamentos financeiros são append-only. Alterações exigem registro explícito de estorno (`REFUNDED`) com justificativa e operador. |
| **Catálogo e Preços (`products`, `categories`)** | Nuvem / Administração | `SKU` + Timestamp | Alterações de preço no catálogo **nunca** alteram pedidos já abertos ou históricos, pois cada item de pedido armazena cópia própria do preço e descrição no ato da venda. |

---

## 3. Segurança da Sessão Temporária por Mesa

1. **Credenciais Efêmeras**: Ao abrir uma mesa, o backend gera `accessCode`, `accessPassword` numérico de 6 dígitos (CSPRNG), `qrToken` público não-secreto e `sessionSecretToken` exclusivo.
2. **Isolamento Estrito no Servidor**: Toda requisição de cliente envia `X-Table-Session-Token`. O servidor valida no banco se a sessão existe, está `ACTIVE`, não expirou (`expiresAt`), não foi revogada (`revokedAt IS NULL`) e se o `tableId` corresponde exatamente à sessão autenticada.
3. **Proteção contra Força Bruta**: Após `maxAuthAttempts` (padrão: 5) tentativas de senha incorretas, a sessão é temporariamente bloqueada (`lockedUntil = now + 5 min`) e o evento é gravado em `audit_logs`.
4. **Revogação Imediata no Fechamento**: Quando o Caixa encerra a conta (`balanceCents == 0` e sem pedidos pendentes), a sessão recebe `status = 'CLOSED'` e `revokedAt = now()`, invalidando instantaneamente qualquer dispositivo conectado.

---

## 4. Estratégia de Backup, Retenção LGPD e Restauração (PostgreSQL)

### Backup Automatizado (Diário + WAL Contínuo)
```bash
# Backup lógico comprimido (formato custom pg_dump)
pg_dump -h $SQL_HOST -U $SQL_ADMIN_USER -d $SQL_DB_NAME -F c -b -v -f "/backups/mesaviva_$(date +%Y%m%d_%H%M%S).dump"
```

### Procedimento de Restauração e Verificação de Integridade
```bash
# Restauração limpa em banco de recuperação e validação de somas financeiras
pg_restore -h $SQL_HOST -U $SQL_ADMIN_USER -d mesaviva_recovery -v "/backups/mesaviva_latest.dump"
psql -h $SQL_HOST -U $SQL_ADMIN_USER -d mesaviva_recovery -c "SELECT COUNT(*) FROM orders; SELECT SUM(paid_cents) FROM accounts WHERE status = 'CLOSED';"
```
