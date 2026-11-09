import React, { useState } from 'react';
import { Clock, CheckCircle2, Flame, Printer, XCircle } from 'lucide-react';
import { PrintableDocument } from './PrintModal.tsx';

interface KitchenViewProps {
  snapshot: any;
  staffUser: any;
  staffToken: string;
  onRefresh: () => Promise<void>;
  onPrint: (doc: PrintableDocument) => void;
}

const STATION_LABELS: Record<string, string> = {
  ALL: 'Todas as Estações',
  COZINHA: 'Cozinha Quente & Grelhados',
  PIZZARIA: 'Pizzaria & Forno a Lenha',
  BAR: 'Bar & Coquetelaria',
  SOBREMESAS: 'Confeitaria & Sobremesas',
};

export const KitchenView: React.FC<KitchenViewProps> = ({
  snapshot,
  staffToken,
  onRefresh,
  onPrint,
}) => {
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [showDelivered, setShowDelivered] = useState<boolean>(false);
  const [cancellingItemId, setCancellingItemId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string>('');

  const orders: any[] = snapshot?.orders || [];
  const orderItems: any[] = snapshot?.orderItems || [];
  const tables: any[] = snapshot?.tables || [];

  const getTableCode = (tableId: number) =>
    tables.find((t) => t.id === tableId)?.code || `M-${tableId}`;

  const handleTransitionItem = async (
    itemId: number,
    newStatus: 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED',
    reason?: string
  ) => {
    setErrorBanner('');
    try {
      const res = await fetch(`/api/kitchen/items/${itemId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-token': staffToken,
        },
        body: JSON.stringify({ newStatus, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || 'Erro ao atualizar estado do item.');
        return;
      }
      setCancellingItemId(null);
      setCancelReason('');
      await onRefresh();
    } catch {
      setErrorBanner('Erro de comunicação ao atualizar estação de preparo.');
    }
  };

  const handlePrintKitchenTicket = (order: any, items: any[]) => {
    const tableCode = getTableCode(order.tableId);
    onPrint({
      title: `COMANDA DE PRODUÇÃO — PEDIDO #${order.orderNumber}`,
      subtitle: `Estação: ${selectedStation} · Origem: ${order.origin}`,
      type: 'KITCHEN_TICKET',
      tableCode,
      lines: items.map((it) => ({
        label: `${it.quantity}x ${it.productNameSnapshot} (${it.stationCode})`,
        value: it.notes ? `OBS: ${it.notes}` : it.status,
      })),
      footerNote: `Horário de entrada: ${new Date(order.createdAt).toLocaleTimeString('pt-BR')} · Prioridade: ${order.priority}`,
    });
  };

  // Filter orders that have at least one item matching the station filter
  const relevantOrders = orders.filter((ord) => {
    if (!showDelivered && (ord.status === 'DELIVERED' || ord.status === 'CANCELLED')) {
      return false;
    }
    const items = orderItems.filter(
      (it) =>
        it.orderId === ord.id &&
        (selectedStation === 'ALL' || it.stationCode === selectedStation)
    );
    return items.length > 0;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Painel KDS — Cozinha, Forno, Bar &amp; Confeitaria
          </h1>
          <p className="text-xs text-slate-500">
            Controle individual por item e estação em tempo real (atualizar um item não marca
            indevidamente itens de outras estações como prontos)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {(['ALL', 'COZINHA', 'PIZZARIA', 'BAR', 'SOBREMESAS'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStation(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedStation === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'Todas Estações' : st}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowDelivered(!showDelivered)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showDelivered
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            {showDelivered ? 'Ocultar Entregues/Cancelados' : 'Mostrar Histórico Entregues'}
          </button>
        </div>
      </div>

      {errorBanner && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button onClick={() => setErrorBanner('')} className="font-semibold underline">
            Fechar
          </button>
        </div>
      )}

      {relevantOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
          <Flame className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-900">
            Nenhum pedido pendente na fila de preparo ({STATION_LABELS[selectedStation]})
          </div>
          <p className="text-xs text-slate-500">
            Novos pedidos enviados pelos clientes ou garçons aparecerão instantaneamente aqui sem
            recarregar a página.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {relevantOrders.map((ord) => {
            const items = orderItems.filter(
              (it) =>
                it.orderId === ord.id &&
                (selectedStation === 'ALL' || it.stationCode === selectedStation)
            );
            const waitMinutes = Math.max(
              0,
              Math.floor((Date.now() - new Date(ord.createdAt).getTime()) / 60000)
            );
            const isDelayed = waitMinutes >= 15 && ord.status !== 'DELIVERED';

            return (
              <div
                key={ord.id}
                className={`bg-white border rounded-xl p-5 flex flex-col justify-between space-y-4 ${
                  isDelayed || ord.priority === 'HIGH'
                    ? 'border-amber-500'
                    : 'border-slate-200'
                }`}
              >
                <div className="space-y-3">
                  {/* Order Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span className="font-bold text-slate-900 text-sm">
                          Pedido #{ord.orderNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-slate-900">
                          Mesa {getTableCode(ord.tableId)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Entrada:{' '}
                        {new Date(ord.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {ord.origin === 'CLIENT' ? 'App Cliente' : `Garçom (${ord.createdByLabel})`}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div
                        className={`text-xs font-bold flex items-center gap-1 justify-end ${
                          isDelayed ? 'text-red-600' : 'text-slate-700'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{waitMinutes} min</span>
                      </div>
                      {ord.priority === 'HIGH' && (
                        <span className="text-[11px] font-bold text-amber-700">
                          PRIORIDADE ALTA
                        </span>
                      )}
                    </div>
                  </div>

                  {ord.notes && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                      Obs. Geral: {ord.notes}
                    </div>
                  )}

                  {/* Individual Station Items */}
                  <div className="divide-y divide-slate-100 space-y-3">
                    {items.map((item) => {
                      const parsedOptions: Array<{ groupName: string; optionName: string }> =
                        JSON.parse(item.selectedOptionsJson || '[]');

                      return (
                        <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">
                                {item.quantity}x {item.productNameSnapshot}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Estação: {item.stationCode} · Estado: {item.status}
                              </div>
                            </div>
                          </div>

                          {parsedOptions.length > 0 && (
                            <div className="text-xs text-slate-600">
                              Adicionais/Opções:{' '}
                              {parsedOptions.map((o) => o.optionName).join(' · ')}
                            </div>
                          )}

                          {item.notes && (
                            <div className="text-xs font-medium text-amber-800">
                              Nota do Item: {item.notes}
                            </div>
                          )}

                          {/* Item State Action Buttons */}
                          {item.status !== 'CANCELLED' && item.status !== 'DELIVERED' && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {item.status === 'RECEIVED' && (
                                <button
                                  type="button"
                                  onClick={() => handleTransitionItem(item.id, 'CONFIRMED')}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-md"
                                >
                                  Confirmar
                                </button>
                              )}
                              {(item.status === 'CONFIRMED' || item.status === 'RECEIVED') && (
                                <button
                                  type="button"
                                  onClick={() => handleTransitionItem(item.id, 'PREPARING')}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded-md"
                                >
                                  Iniciar Preparo
                                </button>
                              )}
                              {item.status === 'PREPARING' && (
                                <button
                                  type="button"
                                  onClick={() => handleTransitionItem(item.id, 'READY')}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Marcar Pronto</span>
                                </button>
                              )}
                              {item.status === 'READY' && (
                                <button
                                  type="button"
                                  onClick={() => handleTransitionItem(item.id, 'DELIVERED')}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md"
                                >
                                  Entregue na Mesa
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setCancellingItemId(item.id)}
                                className="px-2 py-1.5 text-xs text-red-700 hover:bg-red-50 rounded-md flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancelar</span>
                              </button>
                            </div>
                          )}

                          {cancellingItemId === item.id && (
                            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg space-y-2">
                              <input
                                type="text"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Motivo obrigatório p/ auditoria..."
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-red-300 rounded"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleTransitionItem(item.id, 'CANCELLED', cancelReason)
                                  }
                                  className="px-2.5 py-1 text-xs font-semibold bg-red-700 text-white rounded"
                                >
                                  Confirmar Cancelamento
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCancellingItemId(null)}
                                  className="px-2 py-1 text-xs text-slate-600"
                                >
                                  Voltar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">
                    Estado Geral: {ord.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePrintKitchenTicket(ord, items)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Comanda</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
