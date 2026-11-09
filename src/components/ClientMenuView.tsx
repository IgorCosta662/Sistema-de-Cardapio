import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  Bell,
  Receipt,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  LogOut,
  KeyRound,
  Lock,
} from 'lucide-react';
import { DishArtwork } from './DishArtwork.tsx';

interface OptionItem {
  id: string;
  name: string;
  priceCents: number;
}

interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionItem[];
}

interface CartItem {
  cartItemId: string;
  productId: number;
  productName: string;
  basePriceCents: number;
  addonsUnitCents: number;
  quantity: number;
  selectedOptionIds: string[];
  selectedOptionNames: string[];
  notes: string;
}

interface ClientMenuViewProps {
  realtimeTick: number;
}

const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Recebido (Aguardando Garçom)',
  CONFIRMED: 'Confirmado na Fila',
  PREPARING: 'Em Preparação na Estação',
  READY: 'Pronto para Entrega',
  DELIVERED: 'Entregue na Mesa',
  CANCELLED: 'Cancelado',
};

export const ClientMenuView: React.FC<ClientMenuViewProps> = ({ realtimeTick }) => {
  const [sessionToken, setSessionToken] = useState<string>('');
  const [accessCodeInput, setAccessCodeInput] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('qr') || '';
  });
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [sessionData, setSessionData] = useState<any>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'MENU' | 'CART' | 'CONSUMPTION'>('MENU');

  // Product Customization Modal State
  const [customizingProduct, setCustomizingProduct] = useState<any>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemNotes, setItemNotes] = useState<string>('');
  const [customizationError, setCustomizationError] = useState<string>('');

  // Cart & Order Submission State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string>(
    () => `CLI-IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [requestedSplitCount, setRequestedSplitCount] = useState<number>(2);

  const fetchClientSessionData = useCallback(async (tokenToUse: string) => {
    if (!tokenToUse) return;
    try {
      const res = await fetch('/api/client/session-data', {
        headers: { 'x-table-session-token': tokenToUse },
      });
      const data = await res.json();
      if (!res.ok) {
        setSessionToken('');
        setSessionData(null);
        setAuthError(data.error || 'Sessão encerrada ou credenciais revogadas.');
        return;
      }
      setSessionData(data);
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Instabilidade na conexão detectada. Tentando reconectar ao servidor local...',
      });
    }
  }, []);

  useEffect(() => {
    if (sessionToken) {
      fetchClientSessionData(sessionToken);
    }
  }, [sessionToken, realtimeTick, fetchClientSessionData]);

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const isQrToken = accessCodeInput.trim().toUpperCase().startsWith('QR-');
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode: isQrToken ? undefined : accessCodeInput,
          qrToken: isQrToken ? accessCodeInput : undefined,
          accessPassword: passwordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Falha na autenticação da mesa.');
      } else {
        setSessionToken(data.sessionToken);
        await fetchClientSessionData(data.sessionToken);
      }
    } catch {
      setAuthError('Erro de comunicação ao validar credenciais da mesa.');
    } finally {
      setAuthLoading(false);
    }
  };

  const openProductModal = (product: any) => {
    const groups: OptionGroup[] = JSON.parse(product.optionGroupsJson || '[]');
    const defaults: string[] = [];
    for (const g of groups) {
      if (g.required && g.options.length > 0) {
        defaults.push(g.options[0].id);
      }
    }
    setCustomizingProduct(product);
    setSelectedOptions(defaults);
    setItemQuantity(1);
    setItemNotes('');
    setCustomizationError('');
  };

  const toggleOptionSelection = (group: OptionGroup, optionId: string) => {
    setCustomizationError('');
    const groupOptionIds = new Set(group.options.map((o) => o.id));
    const currentInGroup = selectedOptions.filter((id) => groupOptionIds.has(id));

    if (group.maxSelect === 1) {
      const others = selectedOptions.filter((id) => !groupOptionIds.has(id));
      setSelectedOptions([...others, optionId]);
      return;
    }

    if (selectedOptions.includes(optionId)) {
      setSelectedOptions(selectedOptions.filter((id) => id !== optionId));
    } else {
      if (group.maxSelect > 0 && currentInGroup.length >= group.maxSelect) {
        setCustomizationError(`Selecione no máximo ${group.maxSelect} opção(ões) em "${group.name}".`);
        return;
      }
      setSelectedOptions([...selectedOptions, optionId]);
    }
  };

  const handleAddToCart = () => {
    if (!customizingProduct) return;
    const groups: OptionGroup[] = JSON.parse(customizingProduct.optionGroupsJson || '[]');
    let addonsCents = 0;
    const chosenNames: string[] = [];

    for (const g of groups) {
      const chosenInGroup = g.options.filter((o) => selectedOptions.includes(o.id));
      if (g.required && chosenInGroup.length < g.minSelect) {
        setCustomizationError(`Selecione pelo menos ${g.minSelect} opção em "${g.name}".`);
        return;
      }
      for (const c of chosenInGroup) {
        addonsCents += c.priceCents;
        chosenNames.push(`${c.name}${c.priceCents > 0 ? ` (+${formatBRL(c.priceCents)})` : ''}`);
      }
    }

    const basePrice =
      customizingProduct.promotional && customizingProduct.promoPriceCents
        ? customizingProduct.promoPriceCents
        : customizingProduct.priceCents;

    const newItem: CartItem = {
      cartItemId: `${customizingProduct.id}-${Date.now()}`,
      productId: customizingProduct.id,
      productName: customizingProduct.name,
      basePriceCents: basePrice,
      addonsUnitCents: addonsCents,
      quantity: itemQuantity,
      selectedOptionIds: [...selectedOptions],
      selectedOptionNames: chosenNames,
      notes: itemNotes.trim(),
    };

    setCart((prev) => [...prev, newItem]);
    setCustomizingProduct(null);
    setCurrentIdempotencyKey(`CLI-IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setFeedbackBanner({
      type: 'success',
      text: `${itemQuantity}x ${customizingProduct.name} adicionado ao carrinho da mesa.`,
    });
  };

  const handleSendOrder = async (overrideKey?: string) => {
    if (cart.length === 0) return;
    setSubmittingOrder(true);
    setFeedbackBanner(null);
    const keyToUse = overrideKey || currentIdempotencyKey;

    try {
      const res = await fetch('/api/client/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-table-session-token': sessionToken,
        },
        body: JSON.stringify({
          idempotencyKey: keyToUse,
          notes: orderNotes,
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            selectedOptionIds: c.selectedOptionIds,
            notes: c.notes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({ type: 'error', text: data.error || 'Falha ao enviar pedido.' });
      } else {
        setCart([]);
        setOrderNotes('');
        setCurrentIdempotencyKey(`CLI-IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        setActiveSubTab('CONSUMPTION');
        await fetchClientSessionData(sessionToken);
        setFeedbackBanner({
          type: 'success',
          text: data.idempotentReplay
            ? `Reenvio idempotente detectado: Pedido #${data.order.orderNumber} já estava registrado (nenhuma duplicata criada).`
            : `Pedido #${data.order.orderNumber} enviado com sucesso para preparo!`,
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Falha de comunicação com o servidor local. Seu carrinho foi preservado.',
      });
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleTestCrossTableAttack = async () => {
    if (!sessionToken || !sessionData) return;
    const spoofedTableId = sessionData.session.tableId + 1;
    const res = await fetch(`/api/client/session-data?tableId=${spoofedTableId}`, {
      headers: { 'x-table-session-token': sessionToken },
    });
    const data = await res.json();
    setFeedbackBanner({
      type: res.status === 403 ? 'info' : 'error',
      text: `Isolamento Entre Mesas (Tentativa de ler tableId=${spoofedTableId}): HTTP ${res.status} — ${data.error}`,
    });
  };

  const handleTestWaiterModuleBlockedForClient = async () => {
    const res = await fetch('/api/operational/snapshot', {
      headers: { 'x-table-session-token': sessionToken },
    });
    const data = await res.json();
    setFeedbackBanner({
      type: res.status === 401 || res.status === 403 ? 'info' : 'error',
      text: `Isolamento de Perfil (Tentativa de acessar API de Garçom/Admin como Cliente): HTTP ${res.status} — ${data.error}`,
    });
  };

  const handleRequestAssistance = async (type: 'CALL_WAITER' | 'REQUEST_BILL', reason?: string) => {
    try {
      const res = await fetch('/api/client/request-assistance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-table-session-token': sessionToken,
        },
        body: JSON.stringify({
          type,
          reason,
          splitCount: requestedSplitCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({ type: 'error', text: data.error });
      } else {
        await fetchClientSessionData(sessionToken);
        setFeedbackBanner({
          type: 'success',
          text:
            type === 'REQUEST_BILL'
              ? `Solicitação de fechamento de conta (${requestedSplitCount} pessoa(s)) enviada ao Garçom e ao Caixa.`
              : 'Garçom notificado em tempo real! Em instantes você será atendido.',
        });
      }
    } catch {
      setFeedbackBanner({ type: 'error', text: 'Falha ao enviar solicitação.' });
    }
  };

  if (!sessionToken || !sessionData) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-slate-200 rounded-2xl p-6 lg:p-8">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-medium text-amber-700">
                Ambiente Exclusivo do Cliente na Mesa
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                Acesse o Cardápio Digital da sua Mesa
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Não é necessário criar conta pessoal. Digite o código temporário da sessão e a senha
                de 6 dígitos entregue pelo garçom ao abrir sua mesa.
              </p>
            </div>

            <form onSubmit={handleClientLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Código da Sessão da Mesa (ou QR Token)
                </label>
                <input
                  type="text"
                  value={accessCodeInput}
                  onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ex: MESA01-DEMO"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Senha Temporária da Mesa (6 dígitos)
                </label>
                <input
                  type="text"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Ex: 482910"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  required
                />
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>{authLoading ? 'Validando Sessão...' : 'Entrar no Cardápio da Mesa'}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-slate-700" />
                <span>Isolamento Total do Cliente</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                O cliente no celular <strong>não vê</strong> as abas de Garçom, Cozinha, Caixa ou
                Administração, e não tem acesso a dados de outras mesas.
              </p>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1.5">
              <div className="text-xs font-semibold text-slate-900">Como acessar sua mesa:</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Solicite ao garçom a abertura da sua mesa. Ele entregará o comprovante impresso (ou
                exibirá na tela) com o QR Code e a senha numérica exclusiva de 6 dígitos do seu
                atendimento.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
              Proteção ativa: 5 tentativas inválidas bloqueiam o PIN por 5 minutos. O encerramento
              da conta pelo Caixa revoga o token imediatamente.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const productsList: any[] = sessionData.products || [];
  const categoriesList: any[] = sessionData.categories || [];
  const filteredProducts = productsList.filter((p) => {
    const matchesCat = selectedCategoryId === 'ALL' || p.categoryId === selectedCategoryId;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.ingredients.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const cartTotalCents = cart.reduce(
    (acc, item) => acc + (item.basePriceCents + item.addonsUnitCents) * item.quantity,
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Session Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{sessionData.session.tableName}</span>
            <span aria-hidden="true">·</span>
            <span>Setor: {sessionData.session.sector}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">Sessão: {sessionData.session.accessCode}</span>
            <span aria-hidden="true">·</span>
            <span>
              Rede:{' '}
              {sessionData.establishment?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY'
                ? 'Modo Local Wi-Fi (Contingência Offline Ativa)'
                : 'Sincronizado com a Nuvem'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {sessionData.establishment?.tradeName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleRequestAssistance('CALL_WAITER')}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>
              {sessionData.session.serviceCallActive ? 'Garçom Acionado' : 'Chamar Garçom'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleTestCrossTableAttack}
            className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Simula tentativa de ler dados de outra mesa alterando tableId na requisição"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Testar Isolamento de Mesa</span>
          </button>

          <button
            type="button"
            onClick={handleTestWaiterModuleBlockedForClient}
            className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Comprova que o cliente não consegue acessar a API do Garçom/Equipe"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Testar Bloqueio Garçom</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSessionToken('');
              setSessionData(null);
            }}
            className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Mesa</span>
          </button>
        </div>
      </div>

      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            feedbackBanner.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : feedbackBanner.type === 'info'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs for Mobile & Desktop */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSubTab('MENU')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'MENU'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cardápio Digital ({productsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('CART')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'CART'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Carrinho ({cart.reduce((a, b) => a + b.quantity, 0)}) · {formatBRL(cartTotalCents)}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('CONSUMPTION')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'CONSUMPTION'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meus Pedidos &amp; Conta ({formatBRL(sessionData.account?.totalCents || 0)})
          </button>
        </div>
      </div>

      {activeSubTab === 'MENU' && (
        <div className="space-y-6">
          {/* Search & Category Filter Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Todas as Categorias
              </button>
              {categoriesList.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategoryId === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar prato, ingrediente..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => {
              const effectivePrice =
                product.promotional && product.promoPriceCents
                  ? product.promoPriceCents
                  : product.priceCents;

              return (
                <div
                  key={product.id}
                  className={`bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between ${
                    !product.available ? 'opacity-60' : ''
                  }`}
                >
                  <div>
                    <DishArtwork
                      imageKey={product.imageUrl}
                      title={product.name}
                      className="w-full h-44"
                    />
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Estação: {product.stationCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>Preparo: ~{product.prepTimeMinutes} min</span>
                        {product.promotional && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-amber-700">Oferta do Chef</span>
                          </>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {product.description}
                      </p>

                      {product.allergens && (
                        <p className="text-[11px] text-slate-500 pt-1">
                          Alérgenos: {product.allergens}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3.5 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="tabular-nums">
                      {product.promotional && product.promoPriceCents && (
                        <span className="block text-[11px] text-slate-400 line-through font-mono">
                          {formatBRL(product.priceCents)}
                        </span>
                      )}
                      <span className="text-base font-bold text-slate-900 font-mono">
                        {formatBRL(effectivePrice)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!product.available}
                      onClick={() => openProductModal(product)}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white transition-colors whitespace-nowrap shrink-0"
                    >
                      {product.available ? 'Personalizar & Adicionar' : 'Indisponível'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSubTab === 'CART' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Carrinho de Pedidos da Mesa</h2>
              <p className="text-xs text-slate-500">
                Os preços finais são validados pelo servidor no momento do envio.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Chave Idempotência: {currentIdempotencyKey}
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                Seu carrinho está vazio no momento
              </div>
              <p className="text-xs text-slate-500">
                Explore o cardápio digital para adicionar pratos, pizzas ou bebidas.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('MENU')}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg"
              >
                Voltar ao Cardápio
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="divide-y divide-slate-200">
                {cart.map((item) => (
                  <div
                    key={item.cartItemId}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900">
                        {item.quantity}x {item.productName}
                      </div>
                      {item.selectedOptionNames.length > 0 && (
                        <div className="text-xs text-slate-600">
                          Opções: {item.selectedOptionNames.join(' · ')}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-amber-800">Observação: {item.notes}</div>
                      )}
                      <div className="text-xs font-mono text-slate-500">
                        Unitário: {formatBRL(item.basePriceCents + item.addonsUnitCents)}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                        {formatBRL((item.basePriceCents + item.addonsUnitCents) * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) => prev.filter((c) => c.cartItemId !== item.cartItemId))
                        }
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg"
                        aria-label="Remover item do carrinho"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações Gerais do Pedido (Opcional)
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ex: Trazer entradas junto com os pratos principais"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 block">Subtotal Estimado do Pedido</span>
                  <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                    {formatBRL(cartTotalCents)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={submittingOrder}
                    onClick={() => handleSendOrder()}
                    className="min-h-[44px] px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {submittingOrder ? 'Enviando Pedido...' : 'Confirmar e Enviar para Preparo'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'CONSUMPTION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Orders & Item Preparation Status */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Acompanhamento dos Pedidos em Tempo Real
                </h2>
                <p className="text-xs text-slate-500">
                  Atualizado automaticamente conforme a Cozinha e o Bar avançam o preparo
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchClientSessionData(sessionToken)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar</span>
              </button>
            </div>

            {(sessionData.orders || []).length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Nenhum pedido enviado nesta sessão ainda.
              </div>
            ) : (
              <div className="space-y-4">
                {(sessionData.orders || []).map((ord: any) => {
                  const itemsForOrder = (sessionData.orderItems || []).filter(
                    (i: any) => i.orderId === ord.id
                  );
                  return (
                    <div
                      key={ord.id}
                      className="border border-slate-200 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-slate-900">
                            Pedido #{ord.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">
                            Origem: {ord.origin === 'CLIENT' ? 'Celular Cliente' : 'Garçom'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">
                            {ord.syncStatus === 'PENDING_LOCAL'
                              ? 'Salvo no Servidor Local (Fila Sync)'
                              : 'Sincronizado'}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-900">
                          {STATUS_LABELS[ord.status] || ord.status}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {itemsForOrder.map((item: any) => (
                          <div
                            key={item.id}
                            className="py-2 flex items-center justify-between gap-4 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">
                                {item.quantity}x {item.productNameSnapshot}
                              </span>
                              <span className="text-slate-500 ml-2">
                                ({item.stationCode} · {STATUS_LABELS[item.status] || item.status})
                              </span>
                            </div>
                            <span className="font-mono tabular-nums text-slate-800">
                              {formatBRL(item.lineTotalCents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Account Summary & Bill Request */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5 h-fit">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">Resumo de Consumo da Mesa</h2>
              <p className="text-xs text-slate-500">
                Valores calculados no servidor a partir dos pedidos aceitos
              </p>
            </div>

            <div className="space-y-2.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal dos Itens</span>
                <span>{formatBRL(sessionData.account?.subtotalCents || 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Taxa de Serviço ({sessionData.establishment?.serviceFeePercent || 10}%)</span>
                <span>{formatBRL(sessionData.account?.serviceFeeCents || 0)}</span>
              </div>
              {(sessionData.account?.discountCents || 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Desconto Autorizado</span>
                  <span>- {formatBRL(sessionData.account.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total da Conta</span>
                <span>{formatBRL(sessionData.account?.totalCents || 0)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Total Já Pago no Caixa</span>
                <span>{formatBRL(sessionData.account?.paidCents || 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-amber-800 pt-1">
                <span>Saldo Pendente</span>
                <span>{formatBRL(sessionData.account?.balanceCents || 0)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700">
                  Simular Divisão da Conta por Pessoa:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestedSplitCount(Math.max(1, requestedSplitCount - 1))}
                    className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono font-bold w-6 text-center">{requestedSplitCount}</span>
                  <button
                    type="button"
                    onClick={() => setRequestedSplitCount(Math.min(20, requestedSplitCount + 1))}
                    className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
                <span className="text-slate-600">Valor por pessoa ({requestedSplitCount}x):</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatBRL(
                    Math.ceil((sessionData.account?.balanceCents || 0) / requestedSplitCount)
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleRequestAssistance('REQUEST_BILL')}
                className="w-full min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Receipt className="w-4 h-4" />
                <span>
                  {sessionData.session.billRequested
                    ? 'Fechamento Já Solicitado ao Garçom/Caixa'
                    : 'Solicitar Fechamento da Conta'}
                </span>
              </button>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Por segurança financeira, a baixa do pagamento e a liberação da mesa são
                confirmadas exclusivamente pelo operador de Caixa ou Garçom autorizado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Product Customization Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{customizingProduct.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{customizingProduct.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingProduct(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Fechar
              </button>
            </div>

            {(() => {
              const groups: OptionGroup[] = JSON.parse(
                customizingProduct.optionGroupsJson || '[]'
              );
              return groups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{group.name}</span>
                    <span className="text-slate-500">
                      {group.required
                        ? `Obrigatório (mín. ${group.minSelect})`
                        : `Opcional (máx. ${group.maxSelect})`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.options.map((opt) => {
                      const isSelected = selectedOptions.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOptionSelection(group, opt.id)}
                          className={`w-full p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900/5 font-semibold text-slate-900'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <CheckCircle2
                              className={`w-4 h-4 ${
                                isSelected ? 'text-slate-900' : 'text-slate-300'
                              }`}
                            />
                            <span>{opt.name}</span>
                          </span>
                          <span className="font-mono tabular-nums">
                            {opt.priceCents > 0 ? `+ ${formatBRL(opt.priceCents)}` : 'Incluso'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observações do Item (Ex: sem cebola, gelo à parte)
              </label>
              <input
                type="text"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="Digite sua preferência para a cozinha/bar..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            {customizationError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {customizationError}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  className="min-h-[40px] min-w-[40px] border border-slate-300 rounded-lg flex items-center justify-center"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-sm w-8 text-center">{itemQuantity}</span>
                <button
                  type="button"
                  onClick={() => setItemQuantity(Math.min(30, itemQuantity + 1))}
                  className="min-h-[40px] min-w-[40px] border border-slate-300 rounded-lg flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="flex-1 min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Adicionar ao Carrinho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
