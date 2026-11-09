import React, { useState, useEffect, useCallback } from 'react';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { ClientMenuView } from './components/ClientMenuView.tsx';
import { WaiterView } from './components/WaiterView.tsx';
import { KitchenView } from './components/KitchenView.tsx';
import { CashierView } from './components/CashierView.tsx';
import { AdminView } from './components/AdminView.tsx';
import { PrintModal, PrintableDocument } from './components/PrintModal.tsx';
import { KeyRound, Shield, LogOut, Lock } from 'lucide-react';

type ActiveModule = 'CLIENT' | 'WAITER' | 'KITCHEN' | 'CASHIER' | 'ADMIN';

export default function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('CLIENT');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [realtimeTick, setRealtimeTick] = useState<number>(0);

  // Authenticated Staff State (null when accessed by a Customer)
  const [staffUser, setStaffUser] = useState<any>(null);
  const [staffToken, setStaffToken] = useState<string>('');
  const [isStaffPortalRoute, setIsStaffPortalRoute] = useState<boolean>(false);
  const [pinUsername, setPinUsername] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  // Print Preview State
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);

  // Detect whether current access is on the Staff Port (:3001) or dedicated /equipe route
  useEffect(() => {
    const checkRouteAndPort = () => {
      const params = new URLSearchParams(window.location.search);
      const isEquipePath =
        window.location.pathname.startsWith('/equipe') ||
        window.location.hash === '#equipe' ||
        params.has('equipe') ||
        params.get('porta') === 'equipe';

      if (isEquipePath) {
        setIsStaffPortalRoute(true);
      }
    };

    checkRouteAndPort();
    window.addEventListener('hashchange', checkRouteAndPort);

    fetch('/api/port-context')
      .then((r) => r.json())
      .then((ctx) => {
        if (ctx.portRole === 'STAFF_ONLY') {
          setIsStaffPortalRoute(true);
        }
      })
      .catch(() => {});

    return () => window.removeEventListener('hashchange', checkRouteAndPort);
  }, []);

  const loadSnapshot = useCallback(
    async (tokenOverride?: string) => {
      const tokenToUse = tokenOverride ?? staffToken;
      if (!tokenToUse) return;
      setLoading(true);
      try {
        const res = await fetch('/api/operational/snapshot', {
          headers: { 'x-staff-token': tokenToUse },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Acesso restrito.');
          return;
        }
        setSnapshot(data);
        setError('');
      } catch {
        setError('Reconectando ao servidor operacional local...');
      } finally {
        setLoading(false);
      }
    },
    [staffToken]
  );

  // Firebase Auth listener (Syncs Google Sign-In to PostgreSQL users table)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await fetch('/api/auth/firebase-sync', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user && data.staffToken) {
              setStaffUser(data.user);
              setStaffToken(data.staffToken);
              setActiveModule('ADMIN');
              await loadSnapshot(data.staffToken);
            }
          }
        } catch (err) {
          console.error('Erro ao sincronizar Firebase Auth:', err);
        }
      }
    });
    return () => unsub();
  }, [loadSnapshot]);

  // Real-time WebSocket Hub connection with automatic reconnect & role-isolated subscription
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connectWs = () => {
      if (!isMounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        if (staffToken) {
          ws?.send(
            JSON.stringify({
              type: 'SUBSCRIBE_STAFF',
              staffToken,
              stationCode: 'ALL',
            })
          );
          loadSnapshot(staffToken);
        }
      };

      ws.onmessage = () => {
        if (staffToken) {
          loadSnapshot(staffToken);
        }
        setRealtimeTick((t) => t + 1);
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [staffToken, loadSnapshot]);

  const handleStaffPinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pinUsername, pinCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Credenciais inválidas.');
        return;
      }

      const role = data.staffUser.role;
      let resolvedModule: ActiveModule = 'WAITER';
      if (role === 'WAITER') resolvedModule = 'WAITER';
      else if (role === 'KITCHEN') resolvedModule = 'KITCHEN';
      else if (role === 'CASHIER') resolvedModule = 'CASHIER';
      else if (role === 'ADMIN' || role === 'SUPER_ADMIN') resolvedModule = 'ADMIN';

      setStaffUser(data.staffUser);
      setStaffToken(data.staffToken);
      setActiveModule(resolvedModule);
      setPinCode('');
      await loadSnapshot(data.staffToken);
    } catch {
      setAuthError('Falha ao validar credenciais no servidor.');
    }
  };

  const handleStaffLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore if not signed in via Firebase
    }
    setStaffUser(null);
    setStaffToken('');
    setSnapshot(null);
    setPinUsername('');
    setPinCode('');
    setActiveModule('CLIENT');
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Não foi possível concluir login Google.');
    }
  };

  // Compute strictly allowed tabs based on current authenticated user role
  const canSeeWaiter =
    staffUser &&
    (staffUser.role === 'WAITER' ||
      staffUser.role === 'ADMIN' ||
      staffUser.role === 'SUPER_ADMIN');
  const canSeeKitchen =
    staffUser &&
    (staffUser.role === 'KITCHEN' ||
      staffUser.role === 'ADMIN' ||
      staffUser.role === 'SUPER_ADMIN');
  const canSeeCashier =
    staffUser &&
    (staffUser.role === 'CASHIER' ||
      staffUser.role === 'ADMIN' ||
      staffUser.role === 'SUPER_ADMIN');
  const canSeeAdmin =
    staffUser && (staffUser.role === 'ADMIN' || staffUser.role === 'SUPER_ADMIN');

  // When accessed on Staff Port (:3001) or /equipe and not authenticated yet, render dedicated Staff Login Screen (no exposed passwords!)
  if (isStaffPortalRoute && !staffUser) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 space-y-6 shadow-xs">
          <div className="space-y-1.5 text-center">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-2">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Mesa Viva — Portal Restrito da Equipe
            </h1>
            <p className="text-xs text-slate-500">
              Acesso exclusivo para Garçons, Cozinha, Caixa e Administração
            </p>
          </div>

          <form onSubmit={handleStaffPinLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Usuário Corporativo
              </label>
              <input
                type="text"
                value={pinUsername}
                onChange={(e) => setPinUsername(e.target.value)}
                placeholder="Digite seu usuário"
                autoComplete="username"
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha / PIN Pessoal
              </label>
              <input
                type="password"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="••••"
                autoComplete="current-password"
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              <span>Entrar no Sistema</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Autenticar Gerência via Google</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract — Customer view has ZERO staff login buttons */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (!staffUser) setActiveModule('CLIENT');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          Mesa Viva
        </a>

        {/* Zone 2: Navigation links strictly isolated by profile */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <a
            href="#cardapio"
            onClick={(e) => {
              e.preventDefault();
              setActiveModule('CLIENT');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeModule === 'CLIENT'
                ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                : ''
            }`}
          >
            Cardápio da Mesa
          </a>

          {canSeeWaiter && (
            <a
              href="#garcom"
              onClick={(e) => {
                e.preventDefault();
                setActiveModule('WAITER');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeModule === 'WAITER'
                  ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                  : ''
              }`}
            >
              Garçom &amp; Mesas
            </a>
          )}

          {canSeeKitchen && (
            <a
              href="#cozinha"
              onClick={(e) => {
                e.preventDefault();
                setActiveModule('KITCHEN');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeModule === 'KITCHEN'
                  ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                  : ''
              }`}
            >
              Painel Cozinha
            </a>
          )}

          {canSeeCashier && (
            <a
              href="#caixa"
              onClick={(e) => {
                e.preventDefault();
                setActiveModule('CASHIER');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeModule === 'CASHIER'
                  ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                  : ''
              }`}
            >
              Frente de Caixa
            </a>
          )}

          {canSeeAdmin && (
            <a
              href="#admin"
              onClick={(e) => {
                e.preventDefault();
                setActiveModule('ADMIN');
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeModule === 'ADMIN'
                  ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                  : ''
              }`}
            >
              Administração
            </a>
          )}
        </nav>

        {/* Zone 3: Only displays Logout button if a Staff Member is already logged in; Customers see NO staff button */}
        <div className="flex items-center gap-3 shrink-0">
          {staffUser ? (
            <button
              type="button"
              onClick={handleStaffLogout}
              className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair ({staffUser.name})</span>
            </button>
          ) : (
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
              Cardápio Digital
            </span>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1">
        {activeModule === 'CLIENT' ? (
          <ClientMenuView realtimeTick={realtimeTick} />
        ) : loading && !snapshot ? (
          <div className="max-w-7xl mx-auto px-6 py-12 space-y-4">
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-44 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-44 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-44 bg-slate-200 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="max-w-7xl mx-auto px-6 pt-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  {error}
                </div>
              </div>
            )}

            {activeModule === 'WAITER' && canSeeWaiter && (
              <WaiterView
                snapshot={snapshot}
                staffUser={staffUser}
                staffToken={staffToken}
                onRefresh={() => loadSnapshot(staffToken)}
                onPrint={setPrintDoc}
              />
            )}

            {activeModule === 'KITCHEN' && canSeeKitchen && (
              <KitchenView
                snapshot={snapshot}
                staffUser={staffUser}
                staffToken={staffToken}
                onRefresh={() => loadSnapshot(staffToken)}
                onPrint={setPrintDoc}
              />
            )}

            {activeModule === 'CASHIER' && canSeeCashier && (
              <CashierView
                snapshot={snapshot}
                staffUser={staffUser}
                staffToken={staffToken}
                onRefresh={() => loadSnapshot(staffToken)}
                onPrint={setPrintDoc}
              />
            )}

            {activeModule === 'ADMIN' && canSeeAdmin && (
              <AdminView
                snapshot={snapshot}
                staffUser={staffUser}
                staffToken={staffToken}
                onRefresh={() => loadSnapshot(staffToken)}
                onPrint={setPrintDoc}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
        <div>Mesa Viva — Atendimento Digital por Sessão de Mesa</div>
        <div>
          {staffUser ? (
            <span>
              Colaborador Autenticado: <strong>{staffUser.name}</strong> ({staffUser.role})
            </span>
          ) : (
            <span>Atendimento Exclusivo da Mesa</span>
          )}
        </div>
      </footer>

      {/* Thermal & Standard Print Modal */}
      <PrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
