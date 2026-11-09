import React, { useState } from 'react';
import {
  CreditCard,
  Banknote,
  QrCode,
  RotateCcw,
  Lock,
  Printer,
  Calculator,
  CheckCircle2,
} from 'lucide-react';
import { PrintableDocument } from './PrintModal.tsx';

interface CashierViewProps {
  snapshot: any;
  staffUser: any;
  staffToken: string;
  onRefresh: () => Promise<void>;
  onPrint: (doc: PrintableDocument) => void;
}

const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

export const CashierView: React.FC<CashierViewProps> = ({
  snapshot,
  staffToken,
  onRefresh,
  onPrint,
}) => {
  const sessions: any[] = snapshot?.sessions || [];
  const accounts: any[] = snapshot?.accounts || [];
  const tables: any[] = snapshot?.tables || [];
  const orders: any[] = snapshot?.orders || [];
  const orderItems: any[] = snapshot?.orderItems || [];
  const payments: any[] = snapshot?.payments || [];

  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
  const [selectedSessionId, setSelectedSessionId] = useState<number>(
    activeSessions[0]?.id ?? sessions[0]?.id ?? 0
  );

  // Payment Registration State
  const [paymentMethod, setPaymentMethod] = useState<
    'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT' | 'CASH'
  >('PIX');
  const [amountInputReais, setAmountInputReais] = useState<string>('');
  const [confirmationType, setConfirmationType] = useState<
    'MANUAL_CASHIER' | 'PROVIDER_CONFIRMED'
  >('MANUAL_CASHIER');
  const [providerName, setProviderName] = useState<string>('Stone / Bacen Pix');
  const [providerTxId, setProviderTxId] = useState<string>('');
  const [cardBrandLast4, setCardBrandLast4] = useState<string>('');
  const [splitLabel, setSplitLabel] = useState<string>('Integral');

  // Discount / Adjustment State
  const [discountInputReais, setDiscountInputReais] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [refundingPaymentId, setRefundingPaymentId] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState<string>('');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const currentSession =
    sessions.find((s) => s.id === selectedSessionId) || activeSessions[0] || sessions[0];
  const currentAccount = currentSession
    ? accounts.find((a) => a.sessionId === currentSession.id)
    : null;
  const currentTable = currentSession
    ? tables.find((t) => t.id === currentSession.tableId)
    : null;
  const sessionItems = currentSession
    ? orderItems.filter((i) => i.sessionId === currentSession.id && i.status !== 'CANCELLED')
    : [];
  const sessionPayments = currentSession
    ? payments.filter((p) => p.sessionId === currentSession.id)
    : [];

  const handleApplyAdjustments = async (
    serviceFeeEnabled?: boolean,
    splitCount?: number,
    applyDiscount?: boolean
  ) => {
    if (!currentSession) return;
    setFeedback(null);
    const discountCents = applyDiscount
      ? Math.round(parseFloat(discountInputReais.replace(',', '.') || '0') * 100)
      : undefined;

    const res = await fetch(`/api/cashier/accounts/${currentSession.id}/adjustments`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        serviceFeeEnabled,
        splitCount,
        discountCents,
        discountReason: applyDiscount ? discountReason || 'Cortesia Gerencial' : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error });
    } else {
      await onRefresh();
      setFeedback({ type: 'success', text: 'Ajustes da conta recalculados no servidor.' });
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession || !currentAccount) return;
    setFeedback(null);

    const parsedCents = amountInputReais.trim()
      ? Math.round(parseFloat(amountInputReais.replace(',', '.')) * 100)
      : currentAccount.balanceCents;

    const res = await fetch('/api/cashier/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        sessionId: currentSession.id,
        method: paymentMethod,
        amountCents: parsedCents,
        confirmationType,
        providerName,
        providerTransactionId: providerTxId,
        cardBrandLast4,
        splitPartLabel: splitLabel,
        idempotencyKey: `PAY-IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error });
    } else {
      setAmountInputReais('');
      setProviderTxId('');
      await onRefresh();
      setFeedback({
        type: 'success',
        text: `Pagamento de ${formatBRL(data.payment.amountCents)} (${paymentMethod}) registrado! Saldo restante: ${formatBRL(data.account.balanceCents)}.`,
      });
    }
  };

  const handleRefundPayment = async (paymentId: number) => {
    setFeedback(null);
    const res = await fetch(`/api/cashier/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ reason: refundReason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error });
    } else {
      setRefundingPaymentId(null);
      setRefundReason('');
      await onRefresh();
      setFeedback({
        type: 'success',
        text: 'Estorno registrado com sucesso e saldo da conta atualizado.',
      });
    }
  };

  const handleCloseAccountAndSession = async () => {
    if (!currentSession) return;
    setFeedback(null);
    const res = await fetch(`/api/cashier/sessions/${currentSession.id}/close`, {
      method: 'POST',
      headers: { 'x-staff-token': staffToken },
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error });
    } else {
      await onRefresh();
      setFeedback({
        type: 'success',
        text: `Conta encerrada com sucesso! As credenciais temporárias (${currentSession.accessCode}) foram revogadas e a mesa ${currentTable?.code} está Disponível.`,
      });
    }
  };

  const handlePrintAccountStatement = () => {
    if (!currentSession || !currentAccount) return;
    const itemLines = sessionItems.map((it) => ({
      label: `${it.quantity}x ${it.productNameSnapshot}`,
      value: formatBRL(it.lineTotalCents),
    }));

    onPrint({
      title: snapshot?.establishment?.tradeName || 'Mesa Viva',
      subtitle: 'EXTRATO DE CONFERÊNCIA DE CONTA (NÃO É DOCUMENTO FISCAL)',
      type: 'ACCOUNT_SUMMARY',
      tableCode: currentTable?.code,
      lines: [
        ...itemLines,
        { label: 'Subtotal dos Itens', value: formatBRL(currentAccount.subtotalCents) },
        { label: 'Taxa de Serviço Opcional', value: formatBRL(currentAccount.serviceFeeCents) },
        { label: 'Descontos Autorizados', value: `- ${formatBRL(currentAccount.discountCents)}` },
        { label: 'TOTAL DA CONTA', value: formatBRL(currentAccount.totalCents) },
        { label: 'Total Pago Confirmado', value: formatBRL(currentAccount.paidCents) },
        { label: 'SALDO PENDENTE', value: formatBRL(currentAccount.balanceCents) },
      ],
      footerNote:
        'A emissão de NFC-e / Cupom Fiscal Eletrônico deve ser realizada via módulo integrador fiscal homologado SEFAZ.',
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Frente de Caixa, Contas &amp; Pagamentos
          </h1>
          <p className="text-xs text-slate-500">
            Conferência de consumo, divisão de conta, recebimento (Dinheiro, Cartão, Pix), estornos
            auditáveis e encerramento seguro
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="font-semibold underline">
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4 Columns: Sessions & Open Accounts List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 px-1">
            Sessões de Atendimento ({sessions.length})
          </h2>

          <div className="space-y-2 max-h-[560px] overflow-y-auto">
            {sessions.map((ses) => {
              const t = tables.find((tbl) => tbl.id === ses.tableId);
              const acc = accounts.find((a) => a.sessionId === ses.id);
              const isSelected = currentSession?.id === ses.id;

              return (
                <button
                  key={ses.id}
                  type="button"
                  onClick={() => setSelectedSessionId(ses.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors space-y-1.5 ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900/5'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">
                      {t?.name || `Mesa #${ses.tableId}`}
                    </span>
                    <span
                      className={`font-semibold ${
                        ses.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {ses.status === 'ACTIVE' ? 'Ativa' : 'Encerrada'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-500">Total: {formatBRL(acc?.totalCents || 0)}</span>
                    <span
                      className={
                        (acc?.balanceCents || 0) > 0
                          ? 'text-amber-800 font-bold'
                          : 'text-emerald-700 font-bold'
                      }
                    >
                      Saldo: {formatBRL(acc?.balanceCents || 0)}
                    </span>
                  </div>

                  {ses.billRequested && ses.status === 'ACTIVE' && (
                    <div className="text-[11px] font-semibold text-amber-700">
                      Cliente solicitou fechamento ({acc?.splitCount || 1}x)
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 8 Columns: Account Ledger, Payment Terminal & Closing Gate */}
        <div className="lg:col-span-8 space-y-6">
          {currentSession && currentAccount ? (
            <>
              {/* Account Header & Financial Summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs text-slate-500 font-mono">
                      Sessão #{currentSession.id} · Código: {currentSession.accessCode} · Estado:{' '}
                      {currentSession.status}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Conta da {currentTable?.name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintAccountStatement}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-medium border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir Extrato</span>
                    </button>

                    {currentSession.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={handleCloseAccountAndSession}
                        className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Encerrar Conta &amp; Revogar Credenciais</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Financial Totals Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] text-slate-500 block">Subtotal Itens</span>
                    <span className="text-base font-bold text-slate-900">
                      {formatBRL(currentAccount.subtotalCents)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] text-slate-500 block">
                      Serviço (10%) / Desc.
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      +{formatBRL(currentAccount.serviceFeeCents)} / -
                      {formatBRL(currentAccount.discountCents)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                    <span className="text-[11px] text-emerald-800 block">Total Pago</span>
                    <span className="text-base font-bold text-emerald-900">
                      {formatBRL(currentAccount.paidCents)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                    <span className="text-[11px] text-amber-800 block">Saldo Pendente</span>
                    <span className="text-base font-bold text-amber-900">
                      {formatBRL(currentAccount.balanceCents)}
                    </span>
                  </div>
                </div>

                {/* Adjustments Row */}
                {currentSession.status === 'ACTIVE' && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          handleApplyAdjustments(!currentAccount.serviceFeeEnabled, undefined)
                        }
                        className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        {currentAccount.serviceFeeEnabled
                          ? 'Retirar Taxa de Serviço (10%)'
                          : 'Incluir Taxa de Serviço (10%)'}
                      </button>

                      <div className="flex items-center gap-1.5 text-xs">
                        <Calculator className="w-4 h-4 text-slate-400" />
                        <span>Dividir em:</span>
                        {[1, 2, 3, 4, 6].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleApplyAdjustments(undefined, n)}
                            className={`px-2 py-1 rounded font-mono ${
                              currentAccount.splitCount === n
                                ? 'bg-slate-900 text-white font-bold'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={discountInputReais}
                        onChange={(e) => setDiscountInputReais(e.target.value)}
                        placeholder="Desc. R$"
                        className="w-24 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="Motivo do desconto..."
                        className="w-40 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyAdjustments(undefined, undefined, true)}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-lg"
                      >
                        Aplicar Desconto
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Terminal Form */}
              {currentSession.status === 'ACTIVE' && (
                <form
                  onSubmit={handleRegisterPayment}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Registrar Recebimento (Integral ou Parcial)
                    </h3>
                    {currentAccount.splitCount > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const quotaCents = Math.ceil(
                            currentAccount.balanceCents / currentAccount.splitCount
                          );
                          setAmountInputReais((quotaCents / 100).toFixed(2));
                          setSplitLabel(`Cota 1/${currentAccount.splitCount}`);
                        }}
                        className="text-xs font-semibold text-amber-800 underline font-mono"
                      >
                        Preencher 1/{currentAccount.splitCount} (
                        {formatBRL(
                          Math.ceil(currentAccount.balanceCents / currentAccount.splitCount)
                        )}
                        )
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: 'PIX', label: 'Pix', icon: QrCode },
                      { id: 'CARD_CREDIT', label: 'Cartão Crédito', icon: CreditCard },
                      { id: 'CARD_DEBIT', label: 'Cartão Débito', icon: CreditCard },
                      { id: 'CASH', label: 'Dinheiro Espécie', icon: Banknote },
                    ].map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id as any)}
                          className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                            paymentMethod === m.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Valor a Receber (R$) — Vazio = Saldo Total
                      </label>
                      <input
                        type="text"
                        value={amountInputReais}
                        onChange={(e) => setAmountInputReais(e.target.value)}
                        placeholder={(currentAccount.balanceCents / 100).toFixed(2)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tipo de Confirmação
                      </label>
                      <select
                        value={confirmationType}
                        onChange={(e) => setConfirmationType(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="MANUAL_CASHIER">Conferência Manual no Caixa / POS</option>
                        <option value="PROVIDER_CONFIRMED">
                          Confirmado por Provedor (Exige NSU/E2E)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {confirmationType === 'PROVIDER_CONFIRMED'
                          ? 'Código NSU / E2E Provedor (Obrigatório)'
                          : 'Bandeira + 4 Dígitos Finais (Sem PAN completo)'}
                      </label>
                      {confirmationType === 'PROVIDER_CONFIRMED' ? (
                        <input
                          type="text"
                          value={providerTxId}
                          onChange={(e) => setProviderTxId(e.target.value)}
                          placeholder="Ex: E2E1829381920"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          required
                        />
                      ) : (
                        <input
                          type="text"
                          value={cardBrandLast4}
                          onChange={(e) => setCardBrandLast4(e.target.value)}
                          placeholder="Ex: Visa final 4092"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={currentAccount.balanceCents <= 0}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Confirmar Pagamento (
                      {amountInputReais
                        ? `R$ ${amountInputReais}`
                        : formatBRL(currentAccount.balanceCents)}
                      )
                    </span>
                  </button>
                </form>
              )}

              {/* Registered Payments & Authorized Refunds */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Histórico de Lançamentos Financeiros e Estornos ({sessionPayments.length})
                </h3>

                {sessionPayments.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4">
                    Nenhum pagamento registrado para esta conta.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {sessionPayments.map((pay) => (
                      <div key={pay.id} className="py-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-bold font-mono text-slate-900">
                              {formatBRL(pay.amountCents)} · {pay.method}
                            </span>
                            <span className="text-slate-500 ml-2">
                              ({pay.confirmationType} · Operador: {pay.registeredByName})
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`font-semibold ${
                                pay.status === 'REFUNDED' ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              {pay.status === 'REFUNDED' ? 'ESTORNADO' : 'CONFIRMADO'}
                            </span>

                            {pay.status === 'CONFIRMED' && (
                              <button
                                type="button"
                                onClick={() => setRefundingPaymentId(pay.id)}
                                className="px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Estornar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {pay.refundReason && (
                          <div className="text-[11px] text-red-700">
                            Motivo do Estorno: {pay.refundReason} (por {pay.refundedByName})
                          </div>
                        )}

                        {refundingPaymentId === pay.id && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={refundReason}
                              onChange={(e) => setRefundReason(e.target.value)}
                              placeholder="Justificativa obrigatória do estorno..."
                              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-red-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => handleRefundPayment(pay.id)}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-700 text-white rounded"
                            >
                              Confirmar Estorno
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundingPaymentId(null)}
                              className="px-2 py-1.5 text-xs text-slate-600"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Selecione uma sessão na coluna à esquerda para gerenciar pagamentos e encerramento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
