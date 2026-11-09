import React, { useState } from 'react';
import {
  QrCode,
  RotateCw,
  ArrowRightLeft,
  GitMerge,
  PlusCircle,
  BellRing,
  Check,
  Receipt,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { PrintableDocument } from './PrintModal.tsx';

interface WaiterViewProps {
  snapshot: any;
  staffUser: any;
  staffToken: string;
  onRefresh: () => Promise<void>;
  onPrint: (doc: PrintableDocument) => void;
}

const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

const TABLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponível',
  OCCUPIED: 'Ocupada',
  WAITING_SERVICE: 'Aguardando Atendimento',
  WAITING_PAYMENT: 'Aguardando Pagamento',
  CLOSING: 'Em Encerramento',
  MAINTENANCE: 'Manutenção',
};

export const WaiterView: React.FC<WaiterViewProps> = ({
  snapshot,
  staffUser,
  staffToken,
  onRefresh,
  onPrint,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(
    snapshot?.tables?.[0]?.id ?? null
  );
  const [guestCountInput, setGuestCountInput] = useState<number>(2);
  const [targetTransferTableId, setTargetTransferTableId] = useState<number>(0);
  const [secondaryMergeTableId, setSecondaryMergeTableId] = useState<number>(0);

  // Quick Waiter Order Entry State
  const [quickProductId, setQuickProductId] = useState<number>(
    snapshot?.products?.[0]?.id ?? 1
  );
  const [quickQty, setQuickQty] = useState<number>(1);
  const [quickPriority, setQuickPriority] = useState<'NORMAL' | 'HIGH'>('NORMAL');
  const [quickNotes, setQuickNotes] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const tables: any[] = snapshot?.tables || [];
  const sessions: any[] = snapshot?.sessions || [];
  const accounts: any[] = snapshot?.accounts || [];
  const orders: any[] = snapshot?.orders || [];
  const orderItems: any[] = snapshot?.orderItems || [];
  const products: any[] = snapshot?.products || [];

  const filteredTables = tables.filter(
    (t) => statusFilter === 'ALL' || t.status === statusFilter
  );

  const selectedTable = tables.find((t) => t.id === selectedTableId) || tables[0];
  const activeSession = selectedTable?.activeSessionId
    ? sessions.find((s) => s.id === selectedTable.activeSessionId)
    : null;
  const activeAccount = activeSession
    ? accounts.find((a) => a.sessionId === activeSession.id)
    : null;
  const sessionOrders = activeSession
    ? orders.filter((o) => o.sessionId === activeSession.id)
    : [];
  const pastTableSessions = selectedTable
    ? sessions.filter((s) => s.tableId === selectedTable.id && s.status !== 'ACTIVE')
    : [];

  const availableTablesForTransferOrMerge = tables.filter(
    (t) => t.status === 'AVAILABLE' && t.id !== selectedTable?.id
  );

  const handleOpenTable = async () => {
    if (!selectedTable) return;
    setActionMessage(null);
    try {
      const res = await fetch(`/api/tables/${selectedTable.id}/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-token': staffToken,
        },
        body: JSON.stringify({ guestCount: guestCountInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error });
        return;
      }
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Mesa ${selectedTable.code} aberta! Código: ${data.session.accessCode} | Senha: ${data.session.accessPassword}`,
      });
    } catch {
      setActionMessage({ type: 'error', text: 'Erro ao abrir atendimento na mesa.' });
    }
  };

  const handleShowQrAndPrintCredentials = async (sessionId: number) => {
    try {
      const res = await fetch(`/api/tables/sessions/${sessionId}/qr`, {
        headers: { 'x-staff-token': staffToken },
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error });
        return;
      }
      onPrint({
        title: snapshot?.establishment?.tradeName || 'Mesa Viva',
        subtitle: 'Credenciais Temporárias de Acesso ao Cardápio Digital',
        type: 'TABLE_CREDENTIALS',
        tableCode: data.tableCode,
        qrDataUrl: data.qrDataUrl,
        accessCode: data.accessCode,
        accessPassword: data.accessPassword,
        lines: [
          {
            label: 'Validade da Sessão',
            value: new Date(data.expiresAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
          { label: 'Garçom Responsável', value: staffUser?.name || 'Equipe Salão' },
        ],
        footerNote:
          'Escaneie o QR Code com a câmera do celular e digite a senha numérica de 6 dígitos acima para fazer pedidos na sua mesa.',
      });
    } catch {
      setActionMessage({ type: 'error', text: 'Falha ao gerar comprovante de credenciais.' });
    }
  };

  const handleRotateCredentials = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/tables/sessions/${activeSession.id}/rotate-credentials`, {
        method: 'POST',
        headers: { 'x-staff-token': staffToken },
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error });
        return;
      }
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Credenciais rotacionadas! Novo Código: ${data.session.accessCode} | Nova Senha: ${data.session.accessPassword}`,
      });
    } catch {
      setActionMessage({ type: 'error', text: 'Falha ao rotacionar credenciais.' });
    }
  };

  const handleAcknowledgeCall = async (sessionId: number) => {
    await fetch(`/api/tables/sessions/${sessionId}/acknowledge-call`, {
      method: 'POST',
      headers: { 'x-staff-token': staffToken },
    });
    await onRefresh();
  };

  const handleWaiterRequestBill = async () => {
    if (!activeSession) return;
    const res = await fetch(`/api/waiter/sessions/${activeSession.id}/request-bill`, {
      method: 'POST',
      headers: { 'x-staff-token': staffToken },
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMessage({ type: 'error', text: data.error });
    } else {
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Solicitação de fechamento de conta registrada e enviada ao Caixa.`,
      });
    }
  };

  const handleConfirmClientOrder = async (orderId: number) => {
    const res = await fetch(`/api/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'x-staff-token': staffToken },
    });
    if (res.ok) {
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Pedido confirmado pelo garçom e liberado para as estações de preparo!`,
      });
    }
  };

  const handlePlaceWaiterOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !selectedTable) return;
    setActionMessage(null);

    const productObj = products.find((p) => p.id === Number(quickProductId));
    const defaultOptionIds: string[] = [];
    if (productObj) {
      const groups = JSON.parse(productObj.optionGroupsJson || '[]');
      for (const g of groups) {
        if (g.required && g.options?.length > 0) {
          defaultOptionIds.push(g.options[0].id);
        }
      }
    }

    try {
      const res = await fetch('/api/waiter/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-token': staffToken,
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          tableId: selectedTable.id,
          idempotencyKey: `WAI-ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          priority: quickPriority,
          notes: quickNotes,
          items: [
            {
              productId: Number(quickProductId),
              quantity: Number(quickQty),
              selectedOptionIds: defaultOptionIds,
              notes: quickNotes,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error });
        return;
      }
      setQuickNotes('');
      setQuickQty(1);
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Pedido Presencial #${data.order.orderNumber} enviado para a estação de preparo!`,
      });
    } catch {
      setActionMessage({ type: 'error', text: 'Erro ao lançar pedido pelo garçom.' });
    }
  };

  const handleTransferTable = async () => {
    if (!activeSession || !targetTransferTableId) return;
    const res = await fetch(`/api/tables/sessions/${activeSession.id}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ targetTableId: Number(targetTransferTableId) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMessage({ type: 'error', text: data.error });
    } else {
      setSelectedTableId(Number(targetTransferTableId));
      setTargetTransferTableId(0);
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Atendimento transferido de ${data.fromTable} para ${data.toTable} preservando histórico.`,
      });
    }
  };

  const handleMergeTable = async () => {
    if (!activeSession || !secondaryMergeTableId) return;
    const res = await fetch(`/api/tables/sessions/${activeSession.id}/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ secondaryTableId: Number(secondaryMergeTableId) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMessage({ type: 'error', text: data.error });
    } else {
      setSecondaryMergeTableId(0);
      await onRefresh();
      setActionMessage({
        type: 'success',
        text: `Mesas unificadas na sessão atual: ${data.mergedTableCodes.join(', ')}`,
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Mapa Operacional de Mesas &amp; Garçom
          </h1>
          <p className="text-xs text-slate-500">
            Abertura de mesas, emissão de credenciais temporárias, lançamento presencial,
            transferências e histórico de ocupação
          </p>
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
          {[
            { id: 'ALL', label: `Todas (${tables.length})` },
            {
              id: 'AVAILABLE',
              label: `Disponíveis (${tables.filter((t) => t.status === 'AVAILABLE').length})`,
            },
            {
              id: 'OCCUPIED',
              label: `Ocupadas (${tables.filter((t) => t.status === 'OCCUPIED').length})`,
            },
            {
              id: 'WAITING_SERVICE',
              label: `Chamados (${tables.filter((t) => t.status === 'WAITING_SERVICE').length})`,
            },
            {
              id: 'WAITING_PAYMENT',
              label: `Conta (${tables.filter((t) => t.status === 'WAITING_PAYMENT').length})`,
            },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            actionMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-semibold underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Floor Map Grid */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredTables.map((table) => {
            const ses = table.activeSessionId
              ? sessions.find((s) => s.id === table.activeSessionId)
              : null;
            const acc = ses ? accounts.find((a) => a.sessionId === ses.id) : null;
            const isSelected = selectedTable?.id === table.id;

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedTableId(table.id)}
                className={`text-left p-4 rounded-xl border transition-all space-y-3 ${
                  isSelected
                    ? 'bg-white border-slate-900 ring-2 ring-slate-900/10'
                    : 'bg-white border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      {table.sector} · {table.capacity} lugares
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{table.name}</h3>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      table.status === 'AVAILABLE'
                        ? 'text-emerald-700'
                        : table.status === 'WAITING_SERVICE' || table.status === 'WAITING_PAYMENT'
                        ? 'text-amber-700'
                        : table.status === 'MAINTENANCE'
                        ? 'text-slate-400'
                        : 'text-slate-900'
                    }`}
                  >
                    {TABLE_STATUS_LABELS[table.status] || table.status}
                  </span>
                </div>

                {ses ? (
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-500">Código: {ses.accessCode}</span>
                      <span className="font-bold text-amber-800">PIN: {ses.accessPassword}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono tabular-nums pt-1">
                      <span className="text-slate-500">Consumo Parcial:</span>
                      <span className="font-bold text-slate-900">
                        {formatBRL(acc?.totalCents || 0)}
                      </span>
                    </div>
                    {ses.serviceCallActive && (
                      <div className="pt-1 text-amber-700 font-semibold flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5" />
                        <span>{ses.serviceCallReason || 'Solicitou Atendimento'}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-400">
                    {table.notes || 'Pronta para abertura de novo atendimento'}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Right 5 Columns: Selected Table Inspector & Actions */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {selectedTable ? (
            <>
              <div className="border-b border-slate-200 pb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">
                    Código: {selectedTable.code} · {selectedTable.sector}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedTable.name}</h2>
                </div>
                <span className="text-xs font-semibold text-slate-700">
                  {TABLE_STATUS_LABELS[selectedTable.status] || selectedTable.status}
                </span>
              </div>

              {!activeSession ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Esta mesa está <strong>{TABLE_STATUS_LABELS[selectedTable.status]}</strong>.
                    Inicie um atendimento para gerar uma sessão exclusiva, QR Code e senha
                    temporária para os clientes.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quantidade de Clientes na Mesa
                    </label>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={guestCountInput}
                        onChange={(e) => setGuestCountInput(Number(e.target.value))}
                        className="w-28 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={selectedTable.status !== 'AVAILABLE'}
                    onClick={handleOpenTable}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Abrir Mesa e Gerar Credenciais Temporárias
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Credentials Box */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        Credenciais Ativas da Sessão #{activeSession.id}
                      </span>
                      <span className="font-mono text-slate-500">
                        Expira:{' '}
                        {new Date(activeSession.expiresAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block text-[11px]">Código Acesso</span>
                        <span className="font-bold text-slate-900 text-sm">
                          {activeSession.accessCode}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <span className="text-slate-500 block text-[11px]">Senha / PIN (6 díg)</span>
                        <span className="font-bold text-amber-700 text-sm">
                          {activeSession.accessPassword}
                        </span>
                      </div>
                    </div>

                    {activeSession.transferredFromTableCode && (
                      <div className="text-[11px] text-slate-600">
                        Histórico: Transferida originalmente de{' '}
                        <strong>{activeSession.transferredFromTableCode}</strong>
                      </div>
                    )}
                    {activeSession.mergedTableCodes && (
                      <div className="text-[11px] text-slate-600">
                        Mesas unificadas: <strong>{activeSession.mergedTableCodes}</strong>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleShowQrAndPrintCredentials(activeSession.id)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Imprimir QR &amp; Senha</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRotateCredentials}
                        className="min-h-[38px] px-3 py-1.5 border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        title="Revoga o PIN atual e gera novo código imediatamente"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Rotacionar PIN</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleWaiterRequestBill}
                        className="min-h-[38px] px-3 py-1.5 border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Solicitar Conta</span>
                      </button>
                    </div>
                  </div>

                  {activeSession.serviceCallActive && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                      <div className="text-xs text-amber-900">
                        <strong>Chamado Ativo:</strong>{' '}
                        {activeSession.serviceCallReason || 'Cliente solicitou atendimento'}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeCall(activeSession.id)}
                        className="px-3 py-1.5 bg-amber-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Atendido</span>
                      </button>
                    </div>
                  )}

                  {/* Waiter Presencial Order Launch */}
                  <form
                    onSubmit={handlePlaceWaiterOrder}
                    className="space-y-3 border-t border-slate-200 pt-4"
                  >
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <PlusCircle className="w-4 h-4 text-slate-700" />
                      <span>Lançamento Rápido de Pedido Presencial (Garçom)</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Produto do Cardápio
                        </label>
                        <select
                          value={quickProductId}
                          onChange={(e) => setQuickProductId(Number(e.target.value))}
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {products
                            .filter((p) => p.available)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (
                                {formatBRL(
                                  p.promotional && p.promoPriceCents
                                    ? p.promoPriceCents
                                    : p.priceCents
                                )}
                                )
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Qtd / Prioridade
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={quickQty}
                            onChange={(e) => setQuickQty(Number(e.target.value))}
                            className="w-14 px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                          <select
                            value={quickPriority}
                            onChange={(e) =>
                              setQuickPriority(e.target.value as 'NORMAL' | 'HIGH')
                            }
                            className="flex-1 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="HIGH">Prioridade</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={quickNotes}
                      onChange={(e) => setQuickNotes(e.target.value)}
                      placeholder="Observação presencial (ex: cliente com pressa, sem sal)..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />

                    <button
                      type="submit"
                      className="w-full min-h-[40px] py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Lançar Pedido Presencial na Mesa
                    </button>
                  </form>

                  {/* Table Transfer & Merge Controls */}
                  {availableTablesForTransferOrMerge.length > 0 && (
                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <h3 className="text-xs font-bold text-slate-900">
                        Transferência e Junção de Mesas
                      </h3>

                      <div className="flex items-center gap-2">
                        <select
                          value={targetTransferTableId}
                          onChange={(e) => setTargetTransferTableId(Number(e.target.value))}
                          className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value={0}>Selecionar mesa p/ transferir...</option>
                          {availableTablesForTransferOrMerge.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.sector})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!targetTransferTableId}
                          onClick={handleTransferTable}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Transferir</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={secondaryMergeTableId}
                          onChange={(e) => setSecondaryMergeTableId(Number(e.target.value))}
                          className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value={0}>Selecionar mesa p/ juntar...</option>
                          {availableTablesForTransferOrMerge.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.capacity} lug.)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!secondaryMergeTableId}
                          onClick={handleMergeTable}
                          className="px-3 py-2 text-xs font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Juntar Mesa</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Orders & Consumption History of this Table */}
                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">
                        Pedidos da Sessão ({sessionOrders.length})
                      </span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        Total: {formatBRL(activeAccount?.totalCents || 0)}
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {sessionOrders.map((ord) => {
                        const ordItems = orderItems.filter((i) => i.orderId === ord.id);
                        return (
                          <div
                            key={ord.id}
                            className="p-2.5 rounded-lg border border-slate-200 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between font-mono">
                              <span className="font-bold">
                                #{ord.orderNumber} ({ord.origin})
                              </span>
                              <div className="flex items-center gap-2">
                                <span>{ord.status}</span>
                                {ord.status === 'RECEIVED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmClientOrder(ord.id)}
                                    className="px-2 py-0.5 bg-emerald-700 text-white rounded font-sans text-[11px] flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Aprovar Pedido</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            {ordItems.map((it) => (
                              <div
                                key={it.id}
                                className="flex items-center justify-between text-slate-600"
                              >
                                <span>
                                  {it.quantity}x {it.productNameSnapshot} [{it.status}]
                                </span>
                                <span className="font-mono">{formatBRL(it.lineTotalCents)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Past Occupancy History for this Table */}
              {pastTableSessions.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <span className="text-xs font-bold text-slate-900 block">
                    Histórico de Ocupação Anterior ({pastTableSessions.length})
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 text-[11px] text-slate-500 font-mono">
                    {pastTableSessions.map((ps) => (
                      <div
                        key={ps.id}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100"
                      >
                        <span>
                          Sessão #{ps.id} ({ps.accessCode})
                        </span>
                        <span>
                          Encerrada em{' '}
                          {ps.closedAt
                            ? new Date(ps.closedAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-500">Selecione uma mesa no mapa ao lado.</div>
          )}
        </div>
      </div>
    </div>
  );
};
