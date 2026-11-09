import React, { useState } from 'react';
import {
  BarChart3,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  FileSpreadsheet,
  Plus,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Users,
  Settings,
  Utensils,
  LayoutGrid,
} from 'lucide-react';
import { PrintableDocument } from './PrintModal.tsx';

interface AdminViewProps {
  snapshot: any;
  staffUser: any;
  staffToken: string;
  onRefresh: () => Promise<void>;
  onPrint: (doc: PrintableDocument) => void;
}

const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

export const AdminView: React.FC<AdminViewProps> = ({
  snapshot,
  staffUser,
  staffToken,
  onRefresh,
  onPrint,
}) => {
  const [activeTab, setActiveTab] = useState<
    'REPORTS' | 'MENU' | 'TABLES_AND_STAFF' | 'NETWORK_SYNC' | 'AUDIT' | 'ACCEPTANCE_TESTS'
  >('REPORTS');

  // Period Filter State for Reports
  const [startDateFilter, setStartDateFilter] = useState<string>('2026-01-01');
  const [endDateFilter, setEndDateFilter] = useState<string>('2026-12-31');

  // New Category Form State
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newCatSort, setNewCatSort] = useState<number>(10);

  // New Product Form State
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdDesc, setNewProdDesc] = useState<string>('');
  const [newProdPriceReais, setNewProdPriceReais] = useState<string>('59.90');
  const [newProdCategoryId, setNewProdCategoryId] = useState<number>(
    snapshot?.categories?.[0]?.id ?? 1
  );
  const [newProdStation, setNewProdStation] = useState<string>('COZINHA');
  const [editingPriceMap, setEditingPriceMap] = useState<Record<number, string>>({});

  // New Table Form State
  const [newTableCode, setNewTableCode] = useState<string>('');
  const [newTableNumber, setNewTableNumber] = useState<number>(9);
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [newTableSector, setNewTableSector] = useState<string>('Salão Principal');

  // New Staff User Form State
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffUsername, setNewStaffUsername] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<string>('WAITER');
  const [newStaffStation, setNewStaffStation] = useState<string>('COZINHA');
  const [newStaffPin, setNewStaffPin] = useState<string>('5555');

  // Automated Acceptance Suite State
  const [runningSuite, setRunningSuite] = useState<boolean>(false);
  const [suiteResults, setSuiteResults] = useState<
    Array<{ criterionNumber: number; title: string; passed: boolean; evidence: string }>
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const est = snapshot?.establishment;
  const allOrders: any[] = snapshot?.orders || [];
  const allOrderItems: any[] = snapshot?.orderItems || [];
  const allPayments: any[] = snapshot?.payments || [];
  const products: any[] = snapshot?.products || [];
  const categories: any[] = snapshot?.categories || [];
  const tables: any[] = snapshot?.tables || [];
  const staffUsers: any[] = snapshot?.staffUsers || [];
  const syncEvents: any[] = snapshot?.syncEvents || [];
  const auditLogs: any[] = snapshot?.auditLogs || [];

  // Filter records by selected period
  const startMs = new Date(`${startDateFilter}T00:00:00`).getTime();
  const endMs = new Date(`${endDateFilter}T23:59:59`).getTime();

  const orders = allOrders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });
  const orderIdsInPeriod = new Set(orders.map((o) => o.id));
  const orderItems = allOrderItems.filter((i) => orderIdsInPeriod.has(i.orderId));
  const payments = allPayments.filter((p) => {
    const t = new Date(p.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });

  // Real-time Database Metrics Calculation (Distinguishing Created, Accepted, Cancelled, and Sold)
  const totalOrdersCreated = orders.length;
  const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED').length;
  const acceptedValidOrders = orders.filter(
    (o) => o.status !== 'CANCELLED' && o.status !== 'RECEIVED'
  );
  const confirmedPayments = payments.filter((p) => p.status === 'CONFIRMED');
  const refundedPayments = payments.filter((p) => p.status === 'REFUNDED');

  const grossRevenueCents = acceptedValidOrders.reduce((acc, o) => acc + o.subtotalCents, 0);
  const effectiveCollectedCents = confirmedPayments.reduce((acc, p) => acc + p.amountCents, 0);
  const refundedTotalCents = refundedPayments.reduce((acc, p) => acc + p.amountCents, 0);
  const averageTicketCents =
    acceptedValidOrders.length > 0
      ? Math.round(grossRevenueCents / acceptedValidOrders.length)
      : 0;

  // Average Preparation Time Calculation (in minutes)
  const prepDurationMinutesList: number[] = [];
  for (const item of orderItems) {
    if (item.status === 'CANCELLED') continue;
    if (item.readyAt && item.createdAt) {
      const diffMin = Math.max(
        1,
        Math.round(
          (new Date(item.readyAt).getTime() - new Date(item.createdAt).getTime()) / 60000
        )
      );
      prepDurationMinutesList.push(diffMin);
    }
  }
  const avgPrepTimeMinutes =
    prepDurationMinutesList.length > 0
      ? Math.round(
          prepDurationMinutesList.reduce((a, b) => a + b, 0) / prepDurationMinutesList.length
        )
      : 12;

  // 1. Top Sold Products
  const productSalesMap = new Map<
    string,
    { name: string; station: string; qty: number; revenueCents: number }
  >();
  for (const item of orderItems) {
    if (item.status === 'CANCELLED') continue;
    const prev = productSalesMap.get(item.productNameSnapshot) || {
      name: item.productNameSnapshot,
      station: item.stationCode,
      qty: 0,
      revenueCents: 0,
    };
    prev.qty += item.quantity;
    prev.revenueCents += item.lineTotalCents;
    productSalesMap.set(item.productNameSnapshot, prev);
  }
  const topProducts = Array.from(productSalesMap.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents
  );

  // 2. Sales by Category
  const categorySalesMap = new Map<string, { categoryName: string; qty: number; revenueCents: number }>();
  for (const item of orderItems) {
    if (item.status === 'CANCELLED') continue;
    const prod = products.find((p) => p.id === item.productId);
    const cat = categories.find((c) => c.id === prod?.categoryId);
    const catName = cat?.name || 'Outros';
    const prev = categorySalesMap.get(catName) || {
      categoryName: catName,
      qty: 0,
      revenueCents: 0,
    };
    prev.qty += item.quantity;
    prev.revenueCents += item.lineTotalCents;
    categorySalesMap.set(catName, prev);
  }
  const salesByCategory = Array.from(categorySalesMap.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents
  );

  // 3. Consumption by Table
  const tableConsumptionMap = new Map<
    string,
    { tableCode: string; ordersCount: number; revenueCents: number }
  >();
  for (const ord of acceptedValidOrders) {
    const tbl = tables.find((t) => t.id === ord.tableId);
    const code = tbl?.code || `Mesa #${ord.tableId}`;
    const prev = tableConsumptionMap.get(code) || {
      tableCode: code,
      ordersCount: 0,
      revenueCents: 0,
    };
    prev.ordersCount += 1;
    prev.revenueCents += ord.subtotalCents;
    tableConsumptionMap.set(code, prev);
  }
  const consumptionByTable = Array.from(tableConsumptionMap.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents
  );

  // 4. Performance by Waiter / Origin
  const waiterPerformanceMap = new Map<
    string,
    { label: string; ordersCount: number; revenueCents: number }
  >();
  for (const ord of acceptedValidOrders) {
    const label =
      ord.origin === 'WAITER'
        ? `Garçom: ${ord.createdByLabel}`
        : `Autoatendimento Cliente (${ord.createdByLabel})`;
    const prev = waiterPerformanceMap.get(label) || {
      label,
      ordersCount: 0,
      revenueCents: 0,
    };
    prev.ordersCount += 1;
    prev.revenueCents += ord.subtotalCents;
    waiterPerformanceMap.set(label, prev);
  }
  const waiterPerformance = Array.from(waiterPerformanceMap.values()).sort(
    (a, b) => b.revenueCents - a.revenueCents
  );

  // 5. Payment methods breakdown
  const paymentByMethod: Record<string, number> = {
    PIX: 0,
    CARD_CREDIT: 0,
    CARD_DEBIT: 0,
    CASH: 0,
  };
  for (const p of confirmedPayments) {
    paymentByMethod[p.method] = (paymentByMethod[p.method] || 0) + p.amountCents;
  }

  const handleToggleNetworkMode = async () => {
    const nextMode =
      est?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY'
        ? 'ONLINE_SYNCED'
        : 'LOCAL_OFFLINE_CONTINGENCY';

    await fetch('/api/admin/establishment', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ operationMode: nextMode }),
    });
    await onRefresh();
    setStatusMessage(
      nextMode === 'LOCAL_OFFLINE_CONTINGENCY'
        ? 'Modo Contingência Local Wi-Fi ativado: Novos pedidos e pagamentos serão gravados na fila persistente local.'
        : 'Modo Online ativo.'
    );
  };

  const handleUpdateEstablishmentSetting = async (patch: Record<string, any>) => {
    const res = await fetch('/api/admin/establishment', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await onRefresh();
      setStatusMessage('Parâmetros operacionais do estabelecimento atualizados com sucesso.');
    }
  };

  const handleReconcileSyncQueue = async () => {
    const res = await fetch('/api/sync/reconcile', {
      method: 'POST',
      headers: { 'x-staff-token': staffToken },
    });
    const data = await res.json();
    await onRefresh();
    setStatusMessage(
      `Sincronização concluída sem duplicidades: ${data.syncedCount} evento(s) reconciliados com a nuvem.`
    );
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        name: newCatName,
        description: newCatDesc,
        sortOrder: newCatSort,
      }),
    });
    if (res.ok) {
      setNewCatName('');
      setNewCatDesc('');
      await onRefresh();
      setStatusMessage('Nova categoria cadastrada no cardápio.');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(newProdPriceReais.replace(',', '.')) * 100);
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        categoryId: newProdCategoryId,
        stationCode: newProdStation,
        name: newProdName,
        description: newProdDesc,
        priceCents,
      }),
    });
    if (res.ok) {
      setNewProdName('');
      setNewProdDesc('');
      await onRefresh();
      setStatusMessage('Novo produto cadastrado no catálogo.');
    }
  };

  const handleToggleProductAvailability = async (product: any) => {
    await fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ available: !product.available }),
    });
    await onRefresh();
  };

  const handleUpdateProductPrice = async (product: any) => {
    const raw = editingPriceMap[product.id];
    if (!raw) return;
    const priceCents = Math.round(parseFloat(raw.replace(',', '.')) * 100);
    if (isNaN(priceCents) || priceCents <= 0) return;

    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ priceCents }),
    });
    if (res.ok) {
      await onRefresh();
      setStatusMessage(
        `Preço de "${product.name}" atualizado para ${formatBRL(priceCents)} (pedidos anteriores preservam o snapshot do momento da venda).`
      );
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/tables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        code: newTableCode,
        number: newTableNumber,
        name: newTableName,
        capacity: newTableCapacity,
        sector: newTableSector,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMessage(data.error || 'Erro ao criar mesa.');
      return;
    }
    setNewTableCode('');
    setNewTableName('');
    setNewTableNumber((n) => n + 1);
    await onRefresh();
    setStatusMessage(`Mesa ${data.table.code} cadastrada com sucesso.`);
  };

  const handleToggleTableMaintenance = async (tbl: any) => {
    const nextStatus = tbl.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
    const res = await fetch(`/api/admin/tables/${tbl.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMessage(data.error || 'Não foi possível alterar estado da mesa.');
      return;
    }
    await onRefresh();
  };

  const handleCreateStaffUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({
        name: newStaffName,
        username: newStaffUsername,
        role: newStaffRole,
        stationCode: newStaffStation,
        pinCode: newStaffPin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMessage(data.error || 'Erro ao cadastrar funcionário.');
      return;
    }
    setNewStaffName('');
    setNewStaffUsername('');
    await onRefresh();
    setStatusMessage(`Colaborador ${data.user.name} (${data.user.role}) cadastrado.`);
  };

  const handleToggleStaffActive = async (u: any) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-staff-token': staffToken,
      },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMessage(data.error || 'Erro ao atualizar colaborador.');
      return;
    }
    await onRefresh();
  };

  const handleRunAcceptanceSuite = async () => {
    setRunningSuite(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/system/run-acceptance-suite', {
        method: 'POST',
        headers: { 'x-staff-token': staffToken },
      });
      const data = await res.json();
      setSuiteResults(data.results || []);
      await onRefresh();
    } finally {
      setRunningSuite(false);
    }
  };

  const handleExportCsvReport = () => {
    const rows = [
      ['Metrica', 'Valor'],
      ['Periodo Inicial', startDateFilter],
      ['Periodo Final', endDateFilter],
      ['Pedidos Criados', String(totalOrdersCreated)],
      ['Pedidos Aceitos/Validos', String(acceptedValidOrders.length)],
      ['Pedidos Cancelados', String(cancelledOrders)],
      ['Consumo Bruto Aceito (R$)', (grossRevenueCents / 100).toFixed(2)],
      ['Recebido Efetivo Caixa (R$)', (effectiveCollectedCents / 100).toFixed(2)],
      ['Estornos (R$)', (refundedTotalCents / 100).toFixed(2)],
      ['Ticket Medio (R$)', (averageTicketCents / 100).toFixed(2)],
      ['Tempo Medio Preparo (min)', String(avgPrepTimeMinutes)],
    ];
    const csvContent = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_gerencial_mesaviva_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Administração, Relatórios, Equipe, Mesas &amp; Auditoria
          </h1>
          <p className="text-xs text-slate-500">
            Estabelecimento: {est?.name} · CNPJ {est?.cnpj} · Perfil Atual: {staffUser?.role}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
          {[
            { id: 'REPORTS', label: 'Relatórios & Vendas' },
            { id: 'MENU', label: 'Cardápio & Categorias' },
            { id: 'TABLES_AND_STAFF', label: 'Mesas, Equipe & Parâmetros' },
            { id: 'NETWORK_SYNC', label: 'Rede Local & Sync Nuvem' },
            { id: 'AUDIT', label: 'Trilha de Auditoria' },
            { id: 'ACCEPTANCE_TESTS', label: 'Verificação 16 Critérios (E2E)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} className="font-semibold underline">
            Fechar
          </button>
        </div>
      )}

      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          {/* Period Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-slate-700">Filtro de Período:</span>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              />
              <span className="text-slate-400">até</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="text-xs text-slate-500">
              Tempo Médio de Preparo: <strong className="font-mono text-slate-900">{avgPrepTimeMinutes} min</strong>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
              <span className="text-xs font-sans text-slate-500">
                Receita Efetivamente Recebida
              </span>
              <div className="text-2xl font-bold text-slate-900">
                {formatBRL(effectiveCollectedCents)}
              </div>
              <div className="text-[11px] font-sans text-slate-500">
                Estornos: {formatBRL(refundedTotalCents)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
              <span className="text-xs font-sans text-slate-500">
                Consumo Aceito em Preparo/Entregue
              </span>
              <div className="text-2xl font-bold text-slate-900">
                {formatBRL(grossRevenueCents)}
              </div>
              <div className="text-[11px] font-sans text-slate-500">
                Ticket Médio: {formatBRL(averageTicketCents)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
              <span className="text-xs font-sans text-slate-500">
                Pedidos (Criados vs Aceitos vs Cancelados)
              </span>
              <div className="text-2xl font-bold text-slate-900">
                {acceptedValidOrders.length} aceitos
              </div>
              <div className="text-[11px] font-sans text-slate-500">
                Criados: {totalOrdersCreated} · Cancelados: {cancelledOrders}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
              <span className="text-xs font-sans text-slate-500">Exportação Autorizada</span>
              <div className="flex items-center gap-2 pt-2 font-sans">
                <button
                  type="button"
                  onClick={handleExportCsvReport}
                  className="flex-1 py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Baixar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPrint({
                      title: est?.name || 'Mesa Viva',
                      subtitle: 'RELATÓRIO GERENCIAL CONSOLIDADO DO BANCO POSTGRESQL',
                      type: 'MANAGEMENT_REPORT',
                      lines: [
                        { label: 'Pedidos Criados', value: String(totalOrdersCreated) },
                        { label: 'Pedidos Aceitos Válidos', value: String(acceptedValidOrders.length) },
                        { label: 'Pedidos Cancelados', value: String(cancelledOrders) },
                        { label: 'Consumo Bruto Aceito', value: formatBRL(grossRevenueCents) },
                        { label: 'Pagamentos Confirmados', value: formatBRL(effectiveCollectedCents) },
                        { label: 'Estornos Realizados', value: formatBRL(refundedTotalCents) },
                        { label: 'Ticket Médio por Pedido', value: formatBRL(averageTicketCents) },
                        { label: 'Tempo Médio de Preparo', value: `${avgPrepTimeMinutes} min` },
                      ],
                      footerNote: `Extraído em ${new Date().toLocaleString('pt-BR')} por ${staffUser?.name}`,
                    })
                  }
                  className="py-2 px-3 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Top Sold Products Table */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-700" />
                <span>Produtos Mais Vendidos (Registros Reais PostgreSQL)</span>
              </h2>

              {topProducts.length === 0 ? (
                <div className="text-xs text-slate-500 py-6">
                  Nenhum item vendido no período selecionado.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 text-xs">
                  {topProducts.map((tp, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-bold text-slate-900">{tp.name}</span>
                        <span className="text-slate-500 ml-2">· Estação: {tp.station}</span>
                      </div>
                      <div className="font-mono tabular-nums text-right">
                        <span className="text-slate-600 mr-4">{tp.qty} unid.</span>
                        <span className="font-bold text-slate-900">
                          {formatBRL(tp.revenueCents)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment Methods Breakdown & Sales by Category */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Recebimentos por Forma de Pagamento
                </h2>
                <div className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                  {Object.entries(paymentByMethod).map(([method, cents]) => (
                    <div key={method} className="py-2.5 flex items-center justify-between">
                      <span className="font-sans font-medium text-slate-700">{method}</span>
                      <span className="font-bold text-slate-900">{formatBRL(cents)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">Vendas por Categoria</h2>
                <div className="divide-y divide-slate-200 text-xs">
                  {salesByCategory.map((sc, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        {sc.categoryName} ({sc.qty} it.)
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatBRL(sc.revenueCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Consumption by Table & Waiter Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Consumo Consolidado por Mesa</h2>
              <div className="divide-y divide-slate-200 text-xs">
                {consumptionByTable.map((ct, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      Mesa {ct.tableCode} ({ct.ordersCount} pedido(s))
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatBRL(ct.revenueCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Desempenho por Garçom &amp; Canal de Atendimento
              </h2>
              <div className="divide-y divide-slate-200 text-xs">
                {waiterPerformance.map((wp, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      {wp.label} ({wp.ordersCount} pedido(s))
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatBRL(wp.revenueCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'MENU' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Utensils className="w-4 h-4" />
              <span>Catálogo de Produtos, Preços &amp; Disponibilidade Imediata</span>
            </h2>
            <p className="text-xs text-slate-500">
              Alterações de preço valem apenas para novos pedidos; pedidos anteriores preservam o
              snapshot comercial do momento da venda.
            </p>

            <div className="divide-y divide-slate-200">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {prod.name} ({prod.sku})
                    </div>
                    <div className="text-slate-500">
                      Estação: {prod.stationCode} · Preço Atual:{' '}
                      <strong className="font-mono">{formatBRL(prod.priceCents)}</strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder={(prod.priceCents / 100).toFixed(2)}
                      value={editingPriceMap[prod.id] ?? ''}
                      onChange={(e) =>
                        setEditingPriceMap((prev) => ({ ...prev, [prod.id]: e.target.value }))
                      }
                      className="w-24 px-2 py-1.5 font-mono border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateProductPrice(prod)}
                      className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-semibold"
                    >
                      Atualizar Preço
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProductAvailability(prod)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        prod.available
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {prod.available ? 'Disponível (Pausar)' : 'Indisponível (Ativar)'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <form
              onSubmit={handleCreateProduct}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                <span>Cadastrar Novo Produto</span>
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Categoria
                </label>
                <select
                  value={newProdCategoryId}
                  onChange={(e) => setNewProdCategoryId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Estação de Preparo
                </label>
                <select
                  value={newProdStation}
                  onChange={(e) => setNewProdStation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="COZINHA">COZINHA</option>
                  <option value="PIZZARIA">PIZZARIA</option>
                  <option value="BAR">BAR</option>
                  <option value="SOBREMESAS">SOBREMESAS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Produto
                </label>
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  required
                  placeholder="Ex: Polvo Grelhado ao Murro"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Comercial
                </label>
                <input
                  type="text"
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  required
                  placeholder="Ingredientes e modo de preparo..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preço Unitário (R$)
                </label>
                <input
                  type="text"
                  value={newProdPriceReais}
                  onChange={(e) => setNewProdPriceReais(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[40px] py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Salvar Produto no Catálogo
              </button>
            </form>

            <form
              onSubmit={handleCreateCategory}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                <span>Nova Categoria do Cardápio</span>
              </h3>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
                placeholder="Nome da Categoria (Ex: Entradas)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Descrição da categoria"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                value={newCatSort}
                onChange={(e) => setNewCatSort(Number(e.target.value))}
                placeholder="Ordem de exibição"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="w-full py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Criar Categoria
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'TABLES_AND_STAFF' && (
        <div className="space-y-6">
          {/* Establishment Operational Parameters */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span>Parâmetros Operacionais do Estabelecimento</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <button
                type="button"
                onClick={() =>
                  handleUpdateEstablishmentSetting({
                    requireWaiterConfirmation: !est?.requireWaiterConfirmation,
                  })
                }
                className="p-3.5 border border-slate-200 rounded-xl text-left hover:bg-slate-50"
              >
                <div className="font-bold text-slate-900">Confirmação do Garçom</div>
                <div className="text-slate-500 mt-1">
                  {est?.requireWaiterConfirmation
                    ? 'Ativo: Garçom aprova pedido do cliente'
                    : 'Direto: Pedido do cliente vai p/ Cozinha'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleUpdateEstablishmentSetting({
                    allowPartialPayments: !est?.allowPartialPayments,
                  })
                }
                className="p-3.5 border border-slate-200 rounded-xl text-left hover:bg-slate-50"
              >
                <div className="font-bold text-slate-900">Pagamentos Parciais</div>
                <div className="text-slate-500 mt-1">
                  {est?.allowPartialPayments ? 'Habilitado no Caixa' : 'Desabilitado'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleUpdateEstablishmentSetting({
                    allowBillSplit: !est?.allowBillSplit,
                  })
                }
                className="p-3.5 border border-slate-200 rounded-xl text-left hover:bg-slate-50"
              >
                <div className="font-bold text-slate-900">Divisão de Conta</div>
                <div className="text-slate-500 mt-1">
                  {est?.allowBillSplit ? 'Habilitada por pessoa/valor' : 'Desabilitada'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleUpdateEstablishmentSetting({
                    allowTableMerge: !est?.allowTableMerge,
                  })
                }
                className="p-3.5 border border-slate-200 rounded-xl text-left hover:bg-slate-50"
              >
                <div className="font-bold text-slate-900">União de Mesas</div>
                <div className="text-slate-500 mt-1">
                  {est?.allowTableMerge ? 'Permitida para Garçons/Admin' : 'Bloqueada'}
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Tables Management */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                <span>Cadastro e Manutenção de Mesas</span>
              </h2>

              <form onSubmit={handleCreateTable} className="grid grid-cols-2 gap-2.5 text-xs">
                <input
                  type="text"
                  value={newTableCode}
                  onChange={(e) => setNewTableCode(e.target.value)}
                  required
                  placeholder="Código (Ex: M-09)"
                  className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <input
                  type="number"
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(Number(e.target.value))}
                  required
                  placeholder="Número"
                  className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  required
                  placeholder="Nome (Ex: Mesa 09 — Varanda)"
                  className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                  required
                  placeholder="Lugares"
                  className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <input
                  type="text"
                  value={newTableSector}
                  onChange={(e) => setNewTableSector(e.target.value)}
                  required
                  placeholder="Setor"
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="col-span-2 py-2 bg-slate-900 text-white font-semibold rounded-lg"
                >
                  Adicionar Mesa
                </button>
              </form>

              <div className="divide-y divide-slate-200 text-xs pt-2">
                {tables.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900">
                        {t.code} — {t.name}
                      </span>
                      <span className="text-slate-500 ml-2">
                        ({t.capacity} lug. · {t.sector} · {t.status})
                      </span>
                    </div>
                    {!t.activeSessionId && (
                      <button
                        type="button"
                        onClick={() => handleToggleTableMaintenance(t)}
                        className="px-2.5 py-1 border border-slate-300 rounded-md font-semibold hover:bg-slate-50"
                      >
                        {t.status === 'MAINTENANCE' ? 'Liberar Mesa' : 'Pôr em Manutenção'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Staff & RBAC Management */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Funcionários, Perfis RBAC &amp; Estações</span>
              </h2>
              <p className="text-xs text-slate-500">
                Separação formal entre Administrador do Estabelecimento (`ADMIN`) e
                Superadministrador SaaS da Plataforma (`SUPER_ADMIN`).
              </p>

              <form onSubmit={handleCreateStaffUser} className="grid grid-cols-2 gap-2.5 text-xs">
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  required
                  placeholder="Nome Completo"
                  className="px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  value={newStaffUsername}
                  onChange={(e) => setNewStaffUsername(e.target.value)}
                  required
                  placeholder="Login (ex: garcom.joao)"
                  className="px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="WAITER">WAITER (Garçom)</option>
                  <option value="KITCHEN">KITCHEN (Cozinha/Balcão)</option>
                  <option value="CASHIER">CASHIER (Caixa)</option>
                  <option value="ADMIN">ADMIN (Gerente Estabelecimento)</option>
                  {staffUser?.role === 'SUPER_ADMIN' && (
                    <option value="SUPER_ADMIN">SUPER_ADMIN (SaaS Plataforma)</option>
                  )}
                </select>
                <select
                  value={newStaffStation}
                  onChange={(e) => setNewStaffStation(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="COZINHA">Estação: COZINHA</option>
                  <option value="PIZZARIA">Estação: PIZZARIA</option>
                  <option value="BAR">Estação: BAR</option>
                  <option value="SOBREMESAS">Estação: SOBREMESAS</option>
                </select>
                <input
                  type="text"
                  value={newStaffPin}
                  onChange={(e) => setNewStaffPin(e.target.value)}
                  required
                  placeholder="PIN Numérico"
                  className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <button
                  type="submit"
                  className="col-span-2 py-2 bg-slate-900 text-white font-semibold rounded-lg"
                >
                  Cadastrar Funcionário
                </button>
              </form>

              <div className="divide-y divide-slate-200 text-xs pt-2">
                {staffUsers.map((u) => (
                  <div key={u.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900">{u.name}</span>
                      <span className="text-slate-500 ml-2 font-mono">
                        ({u.username} · {u.role} · Estação {u.stationCode})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleStaffActive(u)}
                      className={`px-2.5 py-1 rounded-md font-semibold ${
                        u.active
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {u.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'NETWORK_SYNC' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {est?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY' ? (
                  <span className="text-amber-700 flex items-center gap-1.5">
                    <WifiOff className="w-4 h-4" />
                    <span>Contingência Rede Local Wi-Fi (Queda de Link WAN Simulada)</span>
                  </span>
                ) : (
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <Wifi className="w-4 h-4" />
                    <span>Servidor Local Sincronizado com Nuvem Central</span>
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Controle de Contingência Offline &amp; Fila Persistente de Sincronização
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl">
                Durante queda da internet externa, o servidor operacional local continua atendendo
                garçons, clientes via Wi-Fi e cozinha. Pedidos e pagamentos recebem UUIDs globais e
                aguardam na fila persistente até a reconciliação idempotente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleToggleNetworkMode}
                className="min-h-[42px] px-4 py-2 text-xs font-semibold border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                {est?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY'
                  ? 'Restabelecer Link de Internet (WAN)'
                  : 'Simular Queda de Internet Externa'}
              </button>

              <button
                type="button"
                onClick={handleReconcileSyncQueue}
                className="min-h-[42px] px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sincronizar e Reconciliar Fila Agora</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Automação Windows (`.bat`) — Docker Automático &amp; Servidor Direto em Rede Local
            </h3>
            <p className="text-xs text-slate-600">
              Os arquivos já foram gerados na raiz do projeto (<code>/run-network.bat</code>,{' '}
              <code>/iniciar-docker.bat</code> e <code>/iniciar-rede-local.bat</code>) e em{' '}
              <code>/deploy/windows/</code>. Você também pode baixá-los diretamente abaixo:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 border border-slate-900 bg-slate-900/5 rounded-xl flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 font-mono">run-network.bat</div>
                  <div className="text-slate-600 mt-0.5">
                    Detecta IP local, inicia Backend e Frontend em portas configuráveis e exibe um{' '}
                    <strong>QR Code direto no terminal</strong> para celulares no Wi-Fi.
                  </div>
                </div>
                <a
                  href="/api/deploy/download-bat/run-network"
                  download="run-network.bat"
                  className="px-3.5 py-2 bg-slate-900 text-white font-semibold rounded-lg text-center whitespace-nowrap"
                >
                  Baixar run-network.bat
                </a>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 font-mono">iniciar-docker.bat</div>
                  <div className="text-slate-500 mt-0.5">
                    Importa/constrói a imagem no Docker, sobe PostgreSQL + Servidor com auto-restart
                    e detecta o IP da rede para os QR Codes.
                  </div>
                </div>
                <a
                  href="/api/deploy/download-bat/docker"
                  download="iniciar-docker.bat"
                  className="px-3.5 py-2 bg-slate-900 text-white font-semibold rounded-lg text-center whitespace-nowrap"
                >
                  Baixar .BAT Docker
                </a>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 font-mono">iniciar-rede-local.bat</div>
                  <div className="text-slate-500 mt-0.5">
                    Detecta o IP Wi-Fi/LAN da máquina, libera a porta 3000 no Firewall do Windows e
                    inicia o servidor direto na rede local.
                  </div>
                </div>
                <a
                  href="/api/deploy/download-bat/network"
                  download="iniciar-rede-local.bat"
                  className="px-3.5 py-2 bg-slate-900 text-white font-semibold rounded-lg text-center whitespace-nowrap"
                >
                  Baixar .BAT Rede
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Fila de Eventos de Sincronização (`sync_events`) — Ordem Monotônica &amp; Autoridade
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {syncEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono font-bold text-slate-900">
                      Seq #{evt.sequenceNumber} · {evt.operation} ({evt.entityType}:{' '}
                      {evt.entityGlobalId.slice(0, 18)})
                    </div>
                    <div className="text-slate-500">
                      Domínio de Autoridade: {evt.authorityDomain} · {evt.conflictResolutionNotes}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-semibold ${
                      evt.status === 'PENDING' ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {evt.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'AUDIT' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Registros Imutáveis de Auditoria de Segurança e Operação (`audit_logs`)
          </h2>
          <div className="divide-y divide-slate-200 text-xs">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    {log.action} · {log.actorName} ({log.actorRole})
                    {log.tableCode ? ` · Mesa ${log.tableCode}` : ''}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">{log.detailsJson}</div>
                </div>
                <span className="font-mono text-slate-500 shrink-0">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ACCEPTANCE_TESTS' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <span>Verificação Automatizada dos 16 Critérios de Aceitação (Seção 21)</span>
              </h2>
              <p className="text-xs text-slate-500">
                Executa transações reais no PostgreSQL testando abertura de mesa, isolamento entre
                mesas, idempotência, cozinha, caixa, bloqueio de saldo pendente e revogação.
              </p>
            </div>

            <button
              type="button"
              disabled={runningSuite}
              onClick={handleRunAcceptanceSuite}
              className="min-h-[42px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
            >
              {runningSuite
                ? 'Executando Bateria no PostgreSQL...'
                : 'Executar 16 Testes de Aceitação Agora'}
            </button>
          </div>

          {suiteResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Clique no botão acima para executar e validar todos os 16 critérios de aceitação em
              tempo real contra o banco PostgreSQL.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {suiteResults.map((res) => (
                <div
                  key={res.criterionNumber}
                  className="py-3.5 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      {res.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>
                        Critério #{res.criterionNumber}: {res.title}
                      </span>
                    </div>
                    <p className="text-slate-600 pl-6">{res.evidence}</p>
                  </div>
                  <span
                    className={`font-mono font-bold shrink-0 ${
                      res.passed ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {res.passed ? 'APROVADO' : 'FALHOU'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
