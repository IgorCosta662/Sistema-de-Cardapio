import crypto from 'crypto';
import { db, ensureLocalSchemaIfNeeded } from './index.ts';
import {
  accounts,
  auditLogs,
  categories,
  establishments,
  orderItems,
  orders,
  orderStateHistory,
  payments,
  prepStations,
  products,
  restaurantTables,
  syncEvents,
  tableSessions,
  users,
} from './schema.ts';
import { and, desc, eq } from 'drizzle-orm';

export interface ProductOptionItem {
  id: string;
  name: string;
  priceCents: number;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ProductOptionItem[];
}

function generateRandomCode(prefix: string, length = 6): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${result}`;
}

function generateNumericPassword(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += (bytes[i] % 10).toString();
  }
  return pin;
}

export async function logAudit(params: {
  establishmentId: number;
  actorUserId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  tableCode?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      establishmentId: params.establishmentId,
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      tableCode: params.tableCode ?? '',
      detailsJson: JSON.stringify(params.details ?? {}),
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export async function enqueueSyncEvent(params: {
  entityType: string;
  entityGlobalId: string;
  operation: string;
  payload: Record<string, unknown>;
  authorityDomain: 'LOCAL_OPERATIONAL' | 'CLOUD_CATALOG';
  isOfflineMode: boolean;
}) {
  try {
    const existingEvents = await db.select().from(syncEvents);
    const nextSeq = existingEvents.length + 1;
    const eventGlobalId = `EVT-${crypto.randomUUID()}`;

    await db.insert(syncEvents).values({
      eventGlobalId,
      entityType: params.entityType,
      entityGlobalId: params.entityGlobalId,
      operation: params.operation,
      payloadJson: JSON.stringify(params.payload),
      originNode: 'LOCAL_EDGE_SERVER_01',
      authorityDomain: params.authorityDomain,
      sequenceNumber: nextSeq,
      status: params.isOfflineMode ? 'PENDING' : 'SYNCED',
      conflictResolutionNotes: params.isOfflineMode
        ? 'Aguardando retorno do link WAN para replicação idempotente na nuvem.'
        : 'Sincronizado imediatamente com autoridade operacional preservada.',
      attempts: 1,
      syncedAt: params.isOfflineMode ? null : new Date(),
    });
  } catch (error) {
    console.error('Failed to enqueue sync event:', error);
  }
}

export async function ensureSeedData() {
  try {
    await ensureLocalSchemaIfNeeded();
    const existingEstablishments = await db.select().from(establishments);
    if (existingEstablishments.length > 0) {
      return existingEstablishments[0];
    }

    const [est] = await db
      .insert(establishments)
      .values({
        code: 'EST-001',
        name: 'Restaurante & Brasserie Mesa Viva Ltda',
        tradeName: 'Mesa Viva Brasserie [AMBIENTE DEMO IDENTIFICADO]',
        cnpj: '12.345.678/0001-90',
        address: 'Av. Paulista, 1450 — Bela Vista, São Paulo - SP',
        requireWaiterConfirmation: false,
        serviceFeePercent: 10,
        allowPartialPayments: true,
        allowBillSplit: true,
        allowTableMerge: true,
        sessionTtlMinutes: 240,
        maxAuthAttempts: 5,
        operationMode: 'ONLINE_SYNCED',
      })
      .returning();

    // Seed Prep Stations
    await db.insert(prepStations).values([
      {
        code: 'COZINHA',
        name: 'Cozinha Quente & Grelhados',
        description: 'Pratos principais, carnes na brasa, risotos e entradas quentes',
        active: true,
        establishmentId: est.id,
      },
      {
        code: 'PIZZARIA',
        name: 'Forno a Lenha & Pizzaria',
        description: 'Pizzas napolitanas de fermentação natural e focaccias',
        active: true,
        establishmentId: est.id,
      },
      {
        code: 'BAR',
        name: 'Bar & Coquetelaria',
        description: 'Drinks autorais, chopes artesanais, vinhos e bebidas não alcoólicas',
        active: true,
        establishmentId: est.id,
      },
      {
        code: 'SOBREMESAS',
        name: 'Confeitaria & Café',
        description: 'Sobremesas empratadas, gelatos artesanais e cafés especiais',
        active: true,
        establishmentId: est.id,
      },
    ]);

    // Seed Staff Profiles (Waiter, Kitchen, Cashier, Admin, SuperAdmin)
    const staffMembers = await db
      .insert(users)
      .values([
        {
          uid: 'staff-waiter-01',
          email: 'carlos.garcom@mesaviva.com.br',
          username: 'garcom.carlos',
          name: 'Carlos Eduardo (Garçom Senior)',
          role: 'WAITER',
          stationCode: 'COZINHA',
          pinCode: '1111',
          active: true,
          establishmentId: est.id,
        },
        {
          uid: 'staff-kitchen-01',
          email: 'helena.chef@mesaviva.com.br',
          username: 'chef.helena',
          name: 'Chef Helena (Cozinha & Forno)',
          role: 'KITCHEN',
          stationCode: 'COZINHA',
          pinCode: '2222',
          active: true,
          establishmentId: est.id,
        },
        {
          uid: 'staff-bar-01',
          email: 'rafael.bar@mesaviva.com.br',
          username: 'bar.rafael',
          name: 'Rafael (Barman Chefe)',
          role: 'KITCHEN',
          stationCode: 'BAR',
          pinCode: '2323',
          active: true,
          establishmentId: est.id,
        },
        {
          uid: 'staff-cashier-01',
          email: 'mariana.caixa@mesaviva.com.br',
          username: 'caixa.mariana',
          name: 'Mariana (Operadora de Caixa)',
          role: 'CASHIER',
          stationCode: 'CAIXA',
          pinCode: '3333',
          active: true,
          establishmentId: est.id,
        },
        {
          uid: 'staff-admin-01',
          email: 'roberto.gerente@mesaviva.com.br',
          username: 'admin.roberto',
          name: 'Roberto Almeida (Gerente Geral)',
          role: 'ADMIN',
          stationCode: 'TODOS',
          pinCode: '4444',
          active: true,
          establishmentId: est.id,
        },
        {
          uid: 'staff-superadmin-01',
          email: 'plataforma.saas@mesaviva.com.br',
          username: 'saas.superadmin',
          name: 'Diretoria SaaS (SuperAdmin Multi-Tenant)',
          role: 'SUPER_ADMIN',
          stationCode: 'TODOS',
          pinCode: '9999',
          active: true,
          establishmentId: est.id,
        },
      ])
      .returning();

    // Seed Categories
    const insertedCategories = await db
      .insert(categories)
      .values([
        {
          name: 'Cortes na Parrilla & Pratos Principais',
          description: 'Cortes nobres grelhados na brasa e risotos artesanais',
          sortOrder: 1,
          active: true,
          establishmentId: est.id,
        },
        {
          name: 'Pizzas Napolitanas (Forno a Lenha)',
          description: 'Massa de fermentação lenta 48h com farinha italiana 00',
          sortOrder: 2,
          active: true,
          establishmentId: est.id,
        },
        {
          name: 'Entradas & Compartilháveis',
          description: 'Porções artesanais e antepastos para iniciar a experiência',
          sortOrder: 3,
          active: true,
          establishmentId: est.id,
        },
        {
          name: 'Coquetelaria Autoral & Bebidas',
          description: 'Drinks clássicos, autorais, sucos naturais e refrigerantes',
          sortOrder: 4,
          active: true,
          establishmentId: est.id,
        },
        {
          name: 'Confeitaria & Sobremesas',
          description: 'Fechamento clássico com chocolates belgas e frutas frescas',
          sortOrder: 5,
          active: true,
          establishmentId: est.id,
        },
      ])
      .returning();

    const [catMain, catPizza, catStarters, catDrinks, catDesserts] = insertedCategories;

    // Seed Products with rich Option Groups
    await db.insert(products).values([
      {
        categoryId: catMain.id,
        stationCode: 'COZINHA',
        sku: 'PRT-001',
        name: 'Picanha Angus na Brasa (450g)',
        description:
          'Corte nobre grelhado na parrilla, acompanhado de farofa crocante de manteiga de garrafa, chimichurri artesanal e alho assado.',
        priceCents: 11890,
        promoPriceCents: 10990,
        promotional: true,
        featured: true,
        available: true,
        prepTimeMinutes: 20,
        imageUrl: 'svg:picanha',
        ingredients: 'Picanha bovina Angus, alho, salsa, azeite extravirgem, farinha de mandioca, manteiga',
        allergens: 'Contém lactose (manteiga na farofa) e derivados de leite.',
        optionGroupsJson: JSON.stringify([
          {
            id: 'ponto-carne',
            name: 'Ponto da Carne (Obrigatório)',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: 'mal-passada', name: 'Mal Passada (Selada)', priceCents: 0 },
              { id: 'ao-ponto-menos', name: 'Ao Ponto para Menos (Recomendado)', priceCents: 0 },
              { id: 'ao-ponto', name: 'Ao Ponto', priceCents: 0 },
              { id: 'bem-passada', name: 'Bem Passada', priceCents: 0 },
            ],
          },
          {
            id: 'acompanhamento-extra',
            name: 'Guarnições Adicionais (Opcional)',
            required: false,
            minSelect: 0,
            maxSelect: 3,
            options: [
              { id: 'arroz-biro', name: 'Arroz Biro-Biro (Meia Porção)', priceCents: 1800 },
              { id: 'batata-rustica', name: 'Batatas Rústicas com Alecrim', priceCents: 1600 },
              { id: 'legumes-brasa', name: 'Legumes Orgânicos na Brasa', priceCents: 1900 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catMain.id,
        stationCode: 'COZINHA',
        sku: 'PRT-002',
        name: 'Risoto de Funghi Porcini & Grana Padano',
        description:
          'Arroz Carnaroli italiano cozido lentamente em caldo de cogumelos selvagens, finalizado com manteiga trufada e lascas de Grana Padano 24 meses.',
        priceCents: 7490,
        promoPriceCents: null,
        promotional: false,
        featured: true,
        available: true,
        prepTimeMinutes: 18,
        imageUrl: 'svg:risoto',
        ingredients: 'Arroz Carnaroli, funghi porcini, shiitake, vinho branco seco, manteiga, queijo Grana Padano',
        allergens: 'Contém lactose e derivados de leite. Sem glúten.',
        optionGroupsJson: JSON.stringify([
          {
            id: 'proteina-risoto',
            name: 'Adicionar Proteína ou Finalização',
            required: false,
            minSelect: 0,
            maxSelect: 2,
            options: [
              { id: 'tiras-file', name: 'Medalhão de Filé Mignon (150g)', priceCents: 2600 },
              { id: 'azeite-trufas', name: 'Redução Extra de Trufas Brancas', priceCents: 1200 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catPizza.id,
        stationCode: 'PIZZARIA',
        sku: 'PIZ-001',
        name: 'Pizza Burrata Speciale & Tomates Confit',
        description:
          'Molho de tomates San Marzano DOP, muçarela fior di latte, burrata fresca inteira ao centro, tomates cereja confitados, pesto genovês e manjericão.',
        priceCents: 8600,
        promoPriceCents: null,
        promotional: false,
        featured: true,
        available: true,
        prepTimeMinutes: 15,
        imageUrl: 'svg:pizza',
        ingredients: 'Farinha italiana 00, tomate San Marzano, burrata, fior di latte, manjericão, castanha',
        allergens: 'Contém glúten, lactose e castanhas (no molho pesto).',
        optionGroupsJson: JSON.stringify([
          {
            id: 'tamanho-pizza',
            name: 'Tamanho da Pizza (Obrigatório)',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: 'individual-4', name: 'Individual Napolitana (4 Fatias - 25cm)', priceCents: 0 },
              { id: 'grande-8', name: 'Grande Compartilhável (8 Fatias - 35cm)', priceCents: 1800 },
            ],
          },
          {
            id: 'adicionais-pizza',
            name: 'Adicionais de Charcutaria',
            required: false,
            minSelect: 0,
            maxSelect: 2,
            options: [
              { id: 'parma', name: 'Presunto de Parma Maturado 18 Meses', priceCents: 1600 },
              { id: 'borda-recheada', name: 'Borda com Requeijão de Corte', priceCents: 1200 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catStarters.id,
        stationCode: 'COZINHA',
        sku: 'ENT-001',
        name: 'Croquetas de Costela Defumada (6 unid.)',
        description:
          'Croquetas cremosas de costela bovina defumada por 12 horas em lenha de macieira, empanadas em panko crocante com aioli de páprica defumada.',
        priceCents: 4490,
        promoPriceCents: null,
        promotional: false,
        featured: false,
        available: true,
        prepTimeMinutes: 10,
        imageUrl: 'svg:croqueta',
        ingredients: 'Costela bovina, farinha panko, leite, manteiga, maionese artesanal, páprica',
        allergens: 'Contém glúten, ovo e lactose.',
        optionGroupsJson: JSON.stringify([
          {
            id: 'molho-extra',
            name: 'Molhos Extras',
            required: false,
            minSelect: 0,
            maxSelect: 2,
            options: [
              { id: 'mostarda-mel', name: 'Mostarda Dijon & Mel Silvestre', priceCents: 500 },
              { id: 'pimenta-casa', name: 'Geleia de Pimenta Biquinho', priceCents: 500 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catDrinks.id,
        stationCode: 'BAR',
        sku: 'DRK-001',
        name: 'Botanical Fitzgerald Defumado',
        description:
          'Gin London Dry infusionado com cardamomo, cordial de limão siciliano, bitters aromáticos Angostura e ramo de alecrim defumado na hora.',
        priceCents: 3890,
        promoPriceCents: 3390,
        promotional: true,
        featured: true,
        available: true,
        prepTimeMinutes: 6,
        imageUrl: 'svg:drink',
        ingredients: 'Gin, limão siciliano, xarope artesanal de açúcar demerara, Angostura, alecrim',
        allergens: 'Não contém glúten nem lactose. Bebida alcoólica (proibido para menores de 18 anos).',
        optionGroupsJson: JSON.stringify([
          {
            id: 'versao-drink',
            name: 'Teor Alcoólico (Obrigatório)',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: 'com-alcool', name: 'Receita Original (Gin London Dry)', priceCents: 0 },
              { id: 'sem-alcool', name: 'Mocktail Zero Álcool (Destilado Botânico 0%)', priceCents: 0 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catDrinks.id,
        stationCode: 'BAR',
        sku: 'DRK-002',
        name: 'Soda Italiana de Frutas Vermelhas & Hortelã',
        description:
          'Redução artesanal de amora, framboesa e morango com água com gás Perrier, gelo cristalino e folhas frescas de hortelã.',
        priceCents: 1890,
        promoPriceCents: null,
        promotional: false,
        featured: false,
        available: true,
        prepTimeMinutes: 4,
        imageUrl: 'svg:soda',
        ingredients: 'Morango, framboesa, amora, água gaseificada, hortelã fresca',
        allergens: 'Livre de alérgenos.',
        optionGroupsJson: JSON.stringify([
          {
            id: 'gelo-acucar',
            name: 'Preferência de Preparo',
            required: false,
            minSelect: 0,
            maxSelect: 2,
            options: [
              { id: 'pouco-gelo', name: 'Pouco Gelo', priceCents: 0 },
              { id: 'sem-acucar', name: 'Adoçado com Stevia Natural', priceCents: 0 },
            ],
          },
        ] satisfies ProductOptionGroup[]),
        establishmentId: est.id,
      },
      {
        categoryId: catDesserts.id,
        stationCode: 'SOBREMESAS',
        sku: 'SOB-001',
        name: 'Petit Gâteau Belga 70% & Gelato de Baunilha',
        description:
          'Bolo quente de chocolate belga Callebaut 70% cacau com interior cremoso, servido com farofa de pistache e gelato artesanal de fava de baunilha.',
        priceCents: 3490,
        promoPriceCents: null,
        promotional: false,
        featured: true,
        available: true,
        prepTimeMinutes: 12,
        imageUrl: 'svg:dessert',
        ingredients: 'Chocolate belga 70%, manteiga, ovos caipiras, farinha de trigo, pistache, gelato de baunilha',
        allergens: 'Contém glúten, lactose, ovos e oleaginosas (pistache).',
        optionGroupsJson: JSON.stringify([]),
        establishmentId: est.id,
      },
    ]);

    // Seed Restaurant Tables (8 tables across 3 sectors)
    const insertedTables = await db
      .insert(restaurantTables)
      .values([
        {
          code: 'M-01',
          number: 1,
          name: 'Mesa 01 — Janela Jardins',
          capacity: 4,
          sector: 'Salão Principal',
          status: 'OCCUPIED',
          notes: 'Mesa demonstrativa pré-aberta para teste imediato do cardápio do cliente',
          establishmentId: est.id,
        },
        {
          code: 'M-02',
          number: 2,
          name: 'Mesa 02 — Central',
          capacity: 4,
          sector: 'Salão Principal',
          status: 'AVAILABLE',
          notes: 'Próxima à adega climatizada',
          establishmentId: est.id,
        },
        {
          code: 'M-03',
          number: 3,
          name: 'Mesa 03 — Booth Sofá',
          capacity: 6,
          sector: 'Salão Principal',
          status: 'AVAILABLE',
          notes: 'Ideal para famílias e grupos',
          establishmentId: est.id,
        },
        {
          code: 'M-04',
          number: 4,
          name: 'Mesa 04 — Terraço Coberto',
          capacity: 2,
          sector: 'Varanda Externa',
          status: 'AVAILABLE',
          notes: 'Bistrô 2 lugares',
          establishmentId: est.id,
        },
        {
          code: 'M-05',
          number: 5,
          name: 'Mesa 05 — Pergolado',
          capacity: 6,
          sector: 'Varanda Externa',
          status: 'AVAILABLE',
          notes: 'Área externa climatizada',
          establishmentId: est.id,
        },
        {
          code: 'M-06',
          number: 6,
          name: 'Mesa 06 — Lounge Bar',
          capacity: 4,
          sector: 'Deck Coquetelaria',
          status: 'AVAILABLE',
          notes: 'Mesa alta próxima ao bar',
          establishmentId: est.id,
        },
        {
          code: 'M-07',
          number: 7,
          name: 'Mesa 07 — Sala VIP Reservada',
          capacity: 8,
          sector: 'Mezanino Executivo',
          status: 'AVAILABLE',
          notes: 'Equipada com tela para reuniões',
          establishmentId: est.id,
        },
        {
          code: 'M-08',
          number: 8,
          name: 'Mesa 08 — Canto Varanda',
          capacity: 4,
          sector: 'Varanda Externa',
          status: 'MAINTENANCE',
          notes: 'Em manutenção preventiva do tampo de madeira',
          establishmentId: est.id,
        },
      ])
      .returning();

    // Open an initial active demo session on Table M-01 so the user can immediately test Client, Waiter, Kitchen, and Cashier flows
    const table1 = insertedTables[0];
    const waiter = staffMembers[0];
    const expiresAt = new Date(Date.now() + 240 * 60 * 1000);

    const [demoSession] = await db
      .insert(tableSessions)
      .values({
        globalId: `SES-${crypto.randomUUID()}`,
        tableId: table1.id,
        establishmentId: est.id,
        openedByUserId: waiter.id,
        status: 'ACTIVE',
        guestCount: 3,
        accessCode: 'MESA01-DEMO',
        accessPassword: '482910',
        qrToken: 'QR-M01-ACTIVE-DEMO',
        sessionSecretToken: `TOK-${crypto.randomUUID()}`,
        failedAttempts: 0,
        expiresAt,
      })
      .returning();

    await db
      .update(restaurantTables)
      .set({ activeSessionId: demoSession.id, status: 'OCCUPIED' })
      .where(eq(restaurantTables.id, table1.id));

    await db.insert(accounts).values({
      sessionId: demoSession.id,
      tableId: table1.id,
      establishmentId: est.id,
      status: 'OPEN',
      subtotalCents: 0,
      serviceFeeEnabled: true,
      serviceFeeCents: 0,
      discountCents: 0,
      surchargeCents: 0,
      totalCents: 0,
      paidCents: 0,
      refundedCents: 0,
      balanceCents: 0,
      splitCount: 1,
    });

    await logAudit({
      establishmentId: est.id,
      actorUserId: waiter.id,
      actorName: waiter.name,
      actorRole: waiter.role,
      action: 'DEMO_SESSION_INITIALIZED',
      entityType: 'TABLE_SESSION',
      entityId: String(demoSession.id),
      tableCode: table1.code,
      details: {
        note: 'Sessão inicial de demonstração criada claramente identificada para testes imediatos.',
        accessCode: demoSession.accessCode,
      },
    });

    return est;
  } catch (error) {
    console.error('Error seeding database:', error);
    throw new Error('Falha ao inicializar dados base no PostgreSQL.', { cause: error });
  }
}

export async function recalculateAccountTotals(sessionId: number) {
  try {
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId));
    if (!session) throw new Error('Sessão não encontrada');

    const [est] = await db
      .select()
      .from(establishments)
      .where(eq(establishments.id, session.establishmentId));

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.sessionId, sessionId));
    if (!account) throw new Error('Conta vinculada à sessão não encontrada');

    const allOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.sessionId, sessionId));
    const allItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.sessionId, sessionId));

    // Only include items from orders that are NOT CANCELLED and NOT RECEIVED (awaiting waiter confirmation)
    const validOrderIds = new Set(
      allOrders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'RECEIVED')
        .map((o) => o.id)
    );

    const validItems = allItems.filter(
      (item) => validOrderIds.has(item.orderId) && item.status !== 'CANCELLED'
    );

    const subtotalCents = validItems.reduce((acc, item) => acc + item.lineTotalCents, 0);
    const feePercent = account.serviceFeeEnabled ? (est?.serviceFeePercent ?? 10) : 0;
    const serviceFeeCents = Math.round((subtotalCents * feePercent) / 100);

    const totalCents = Math.max(
      0,
      subtotalCents + serviceFeeCents + account.surchargeCents - account.discountCents
    );

    const sessionPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.accountId, account.id));

    const confirmedPaymentsCents = sessionPayments
      .filter((p) => p.status === 'CONFIRMED')
      .reduce((acc, p) => acc + p.amountCents, 0);

    const refundedCents = sessionPayments
      .filter((p) => p.status === 'REFUNDED')
      .reduce((acc, p) => acc + p.amountCents, 0);

    const balanceCents = Math.max(0, totalCents - confirmedPaymentsCents);

    const [updated] = await db
      .update(accounts)
      .set({
        subtotalCents,
        serviceFeeCents,
        totalCents,
        paidCents: confirmedPaymentsCents,
        refundedCents,
        balanceCents,
        status:
          account.status === 'CLOSED'
            ? 'CLOSED'
            : balanceCents === 0 && totalCents > 0
            ? 'PAID'
            : 'OPEN',
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id))
      .returning();

    return updated;
  } catch (error) {
    console.error('Error recalculating account:', error);
    throw new Error('Falha ao recalcular saldo da conta no servidor.', { cause: error });
  }
}

export async function openTableSession(params: {
  tableId: number;
  guestCount: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [table] = await tx
        .select()
        .from(restaurantTables)
        .where(eq(restaurantTables.id, params.tableId));

      if (!table) {
        throw new Error('Mesa não encontrada.');
      }
      if (table.status === 'MAINTENANCE') {
        throw new Error('Esta mesa está indisponível para manutenção.');
      }
      if (table.activeSessionId !== null || table.status !== 'AVAILABLE') {
        throw new Error(
          `Concorrência bloqueada: A ${table.code} já possui atendimento ativo (${table.status}).`
        );
      }

      // Double check no ACTIVE session exists in table_sessions for this tableId
      const existingActive = await tx
        .select()
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.tableId, params.tableId),
            eq(tableSessions.status, 'ACTIVE')
          )
        );
      if (existingActive.length > 0) {
        throw new Error('Já existe uma sessão ativa registrada para esta mesa.');
      }

      const [est] = await tx
        .select()
        .from(establishments)
        .where(eq(establishments.id, table.establishmentId));

      const ttlMinutes = est?.sessionTtlMinutes ?? 240;
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      const accessCode = generateRandomCode(table.code.replace('-', ''), 4);
      const accessPassword = generateNumericPassword(6);
      const qrToken = `QR-${table.code}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const sessionSecretToken = `TOK-${crypto.randomUUID()}`;
      const globalId = `SES-${crypto.randomUUID()}`;

      const [session] = await tx
        .insert(tableSessions)
        .values({
          globalId,
          tableId: table.id,
          establishmentId: table.establishmentId,
          openedByUserId: params.actorUserId,
          status: 'ACTIVE',
          guestCount: Math.max(1, params.guestCount),
          accessCode,
          accessPassword,
          qrToken,
          sessionSecretToken,
          failedAttempts: 0,
          expiresAt,
        })
        .returning();

      await tx
        .update(restaurantTables)
        .set({
          status: 'OCCUPIED',
          activeSessionId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(restaurantTables.id, table.id));

      const [account] = await tx
        .insert(accounts)
        .values({
          sessionId: session.id,
          tableId: table.id,
          establishmentId: table.establishmentId,
          status: 'OPEN',
          subtotalCents: 0,
          serviceFeeEnabled: true,
          serviceFeeCents: 0,
          discountCents: 0,
          surchargeCents: 0,
          totalCents: 0,
          paidCents: 0,
          refundedCents: 0,
          balanceCents: 0,
          splitCount: 1,
        })
        .returning();

      await tx.insert(auditLogs).values({
        establishmentId: table.establishmentId,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action: 'TABLE_OPENED_AND_CREDENTIALS_GENERATED',
        entityType: 'TABLE_SESSION',
        entityId: String(session.id),
        tableCode: table.code,
        detailsJson: JSON.stringify({
          guestCount: params.guestCount,
          accessCode: session.accessCode,
          expiresAt: session.expiresAt,
        }),
      });

      return { session, table, account };
    });
  } catch (error: any) {
    console.error('Error in openTableSession:', error);
    throw new Error(error.message || 'Falha ao abrir mesa.', { cause: error });
  }
}

export async function rotateTableCredentials(params: {
  sessionId: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, params.sessionId));
    if (!session || session.status !== 'ACTIVE') {
      throw new Error('Sessão inativa ou encerrada; não é possível rotacionar credenciais.');
    }

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, session.tableId));

    const newAccessCode = generateRandomCode((table?.code || 'M').replace('-', ''), 4);
    const newAccessPassword = generateNumericPassword(6);
    const newQrToken = `QR-${table?.code || 'M'}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const newSecretToken = `TOK-${crypto.randomUUID()}`;
    const newExpiresAt = new Date(Date.now() + 240 * 60 * 1000);

    const [updated] = await db
      .update(tableSessions)
      .set({
        accessCode: newAccessCode,
        accessPassword: newAccessPassword,
        qrToken: newQrToken,
        sessionSecretToken: newSecretToken,
        failedAttempts: 0,
        lockedUntil: null,
        expiresAt: newExpiresAt,
      })
      .where(eq(tableSessions.id, session.id))
      .returning();

    await logAudit({
      establishmentId: session.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'SESSION_CREDENTIALS_ROTATED',
      entityType: 'TABLE_SESSION',
      entityId: String(session.id),
      tableCode: table?.code,
      details: {
        newAccessCode,
        note: 'Credenciais anteriores e tokens ativos foram revogados imediatamente.',
      },
    });

    return updated;
  } catch (error: any) {
    console.error('Error rotating credentials:', error);
    throw new Error(error.message || 'Falha ao rotacionar credenciais.', { cause: error });
  }
}

export async function authenticateClientTableSession(params: {
  accessCode?: string;
  qrToken?: string;
  accessPassword: string;
}) {
  try {
    let sessionList = [];
    if (params.qrToken && params.qrToken.trim()) {
      sessionList = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.qrToken, params.qrToken.trim()));
    } else if (params.accessCode && params.accessCode.trim()) {
      sessionList = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.accessCode, params.accessCode.trim().toUpperCase()));
    } else {
      throw new Error('Informe o código de acesso ou escaneie o QR Code da mesa.');
    }

    const session = sessionList[0];
    if (!session) {
      throw new Error('Credenciais de mesa inválidas ou não encontradas.');
    }

    if (session.status !== 'ACTIVE') {
      throw new Error(
        `Esta sessão de atendimento não está mais ativa (Estado: ${session.status}). Solicite auxílio ao garçom.`
      );
    }

    if (session.revokedAt) {
      throw new Error('As credenciais desta mesa foram revogadas.');
    }

    if (new Date() > new Date(session.expiresAt)) {
      throw new Error('As credenciais temporárias desta mesa expiraram. Solicite renovação ao garçom.');
    }

    if (session.lockedUntil && new Date() < new Date(session.lockedUntil)) {
      const waitSeconds = Math.ceil(
        (new Date(session.lockedUntil).getTime() - Date.now()) / 1000
      );
      throw new Error(
        `Muitas tentativas incorretas. Acesso temporariamente bloqueado por mais ${waitSeconds}s.`
      );
    }

    const [est] = await db
      .select()
      .from(establishments)
      .where(eq(establishments.id, session.establishmentId));
    const maxAttempts = est?.maxAuthAttempts ?? 5;

    if (session.accessPassword !== params.accessPassword.trim()) {
      const nextAttempts = session.failedAttempts + 1;
      const shouldLock = nextAttempts >= maxAttempts;
      const lockedUntil = shouldLock ? new Date(Date.now() + 5 * 60 * 1000) : null;

      await db
        .update(tableSessions)
        .set({
          failedAttempts: nextAttempts,
          lockedUntil,
        })
        .where(eq(tableSessions.id, session.id));

      await logAudit({
        establishmentId: session.establishmentId,
        actorName: 'Cliente Anônimo',
        actorRole: 'CLIENT',
        action: shouldLock ? 'CLIENT_AUTH_LOCKED_BRUTE_FORCE' : 'CLIENT_AUTH_FAILED',
        entityType: 'TABLE_SESSION',
        entityId: String(session.id),
        details: { failedAttempts: nextAttempts, maxAttempts },
      });

      if (shouldLock) {
        throw new Error(
          `Limite de ${maxAttempts} tentativas excedido. Sessão bloqueada por 5 minutos por segurança.`
        );
      }
      throw new Error(
        `Senha da mesa incorreta. Tentativa ${nextAttempts} de ${maxAttempts}.`
      );
    }

    // Reset failed attempts on valid login
    if (session.failedAttempts > 0) {
      await db
        .update(tableSessions)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(tableSessions.id, session.id));
    }

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, session.tableId));

    await logAudit({
      establishmentId: session.establishmentId,
      actorName: `Cliente (${table?.code || 'Mesa'})`,
      actorRole: 'CLIENT',
      action: 'CLIENT_SESSION_AUTHENTICATED',
      entityType: 'TABLE_SESSION',
      entityId: String(session.id),
      tableCode: table?.code,
      details: { accessCode: session.accessCode },
    });

    return { session, table };
  } catch (error: any) {
    throw new Error(error.message || 'Falha na autenticação da mesa.', { cause: error });
  }
}

export async function validateActiveClientToken(token: string) {
  try {
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.sessionSecretToken, token));

    if (!session) {
      throw new Error('Sessão inválida ou token revogado.');
    }
    if (session.status !== 'ACTIVE' || session.revokedAt) {
      throw new Error('Atendimento encerrado ou credenciais revogadas.');
    }
    if (new Date() > new Date(session.expiresAt)) {
      throw new Error('Credenciais temporárias expiradas.');
    }

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, session.tableId));

    if (!table || table.status === 'CLOSING' || table.status === 'AVAILABLE') {
      throw new Error('Esta mesa não está mais aceitando operações.');
    }

    return { session, table };
  } catch (error: any) {
    throw new Error(error.message || 'Sessão não autorizada.', { cause: error });
  }
}

export interface CreateOrderItemInput {
  productId: number;
  quantity: number;
  selectedOptionIds: string[];
  notes?: string;
}

export async function createOrderTransaction(params: {
  sessionId: number;
  tableId: number;
  origin: 'CLIENT' | 'WAITER';
  actorUserId?: number | null;
  actorName: string;
  actorRole: string;
  idempotencyKey: string;
  priority?: 'NORMAL' | 'HIGH';
  notes?: string;
  items: CreateOrderItemInput[];
}) {
  try {
    if (!params.idempotencyKey || params.idempotencyKey.trim().length < 6) {
      throw new Error('Chave de idempotência obrigatória para evitar duplicidade de pedidos.');
    }
    if (!params.items || params.items.length === 0) {
      throw new Error('O pedido precisa conter pelo menos 1 item válido.');
    }

    // 1. Check Idempotency Key first — if order already exists, return it idempotently without duplicating!
    const existingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, params.idempotencyKey.trim()));

    if (existingOrders.length > 0) {
      const existingOrder = existingOrders[0];
      const existingItems = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, existingOrder.id));
      return {
        order: existingOrder,
        items: existingItems,
        idempotentReplay: true,
      };
    }

    // 2. Validate session, table, and establishment rules
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, params.sessionId));

    if (!session || session.status !== 'ACTIVE' || session.revokedAt) {
      throw new Error('A sessão da mesa não está ativa ou foi revogada.');
    }
    if (session.tableId !== params.tableId) {
      throw new Error('Violação de isolamento entre mesas detectada e bloqueada.');
    }

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, session.tableId));

    if (!table || table.status === 'CLOSING' || table.status === 'MAINTENANCE') {
      throw new Error(`A mesa ${table?.code || ''} está em fechamento e não aceita novos pedidos.`);
    }

    const [est] = await db
      .select()
      .from(establishments)
      .where(eq(establishments.id, session.establishmentId));

    // Determine initial status based on establishment rule for CLIENT vs WAITER orders
    const needsWaiterApproval =
      params.origin === 'CLIENT' && Boolean(est?.requireWaiterConfirmation);
    const initialOrderStatus = needsWaiterApproval ? 'RECEIVED' : 'CONFIRMED';

    // 3. Validate every product and option price strictly on the backend (Frontend is NEVER price authority)
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.establishmentId, session.establishmentId));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const validatedItemsToInsert: Array<{
      productId: number;
      stationCode: string;
      productNameSnapshot: string;
      productDescriptionSnapshot: string;
      unitPriceCentsSnapshot: number;
      quantity: number;
      selectedOptionsJson: string;
      addonsUnitCentsSnapshot: number;
      lineTotalCents: number;
      notes: string;
      status: string;
    }> = [];

    let orderSubtotalCents = 0;

    for (const itemInput of params.items) {
      const qty = Math.floor(Number(itemInput.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
        throw new Error('Quantidade de item inválida.');
      }

      const product = productMap.get(Number(itemInput.productId));
      if (!product) {
        throw new Error(`Produto #${itemInput.productId} não encontrado no cardápio.`);
      }
      if (!product.available) {
        throw new Error(`O produto "${product.name}" está temporariamente indisponível.`);
      }

      const baseUnitPriceCents =
        product.promotional && product.promoPriceCents
          ? product.promoPriceCents
          : product.priceCents;

      const optionGroups: ProductOptionGroup[] = JSON.parse(product.optionGroupsJson || '[]');
      const selectedIds = new Set(itemInput.selectedOptionIds || []);
      const chosenOptionsSnapshot: Array<{
        groupName: string;
        optionId: string;
        optionName: string;
        priceCents: number;
      }> = [];

      let addonsUnitCents = 0;

      for (const group of optionGroups) {
        const groupSelections = group.options.filter((opt) => selectedIds.has(opt.id));
        if (group.required && groupSelections.length < group.minSelect) {
          throw new Error(
            `O grupo obrigatório "${group.name}" do produto "${product.name}" exige pelo menos ${group.minSelect} seleção(ões).`
          );
        }
        if (group.maxSelect > 0 && groupSelections.length > group.maxSelect) {
          throw new Error(
            `O grupo "${group.name}" do produto "${product.name}" permite no máximo ${group.maxSelect} seleção(ões).`
          );
        }
        for (const sel of groupSelections) {
          addonsUnitCents += sel.priceCents;
          chosenOptionsSnapshot.push({
            groupName: group.name,
            optionId: sel.id,
            optionName: sel.name,
            priceCents: sel.priceCents,
          });
        }
      }

      const lineTotalCents = (baseUnitPriceCents + addonsUnitCents) * qty;
      orderSubtotalCents += lineTotalCents;

      validatedItemsToInsert.push({
        productId: product.id,
        stationCode: product.stationCode,
        productNameSnapshot: product.name,
        productDescriptionSnapshot: product.description,
        unitPriceCentsSnapshot: baseUnitPriceCents,
        quantity: qty,
        selectedOptionsJson: JSON.stringify(chosenOptionsSnapshot),
        addonsUnitCentsSnapshot: addonsUnitCents,
        lineTotalCents,
        notes: (itemInput.notes || '').slice(0, 280),
        status: initialOrderStatus,
      });
    }

    const existingAllOrders = await db.select().from(orders);
    const nextOrderNumber = 101 + existingAllOrders.length;
    const isOfflineMode = est?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY';
    const orderGlobalId = `ORD-${crypto.randomUUID()}`;

    const [createdOrder] = await db
      .insert(orders)
      .values({
        globalId: orderGlobalId,
        orderNumber: nextOrderNumber,
        sessionId: session.id,
        tableId: table.id,
        establishmentId: session.establishmentId,
        origin: params.origin,
        createdByUserId: params.actorUserId ?? null,
        createdByLabel: params.actorName,
        idempotencyKey: params.idempotencyKey.trim(),
        status: initialOrderStatus,
        priority: params.priority || 'NORMAL',
        notes: (params.notes || '').slice(0, 300),
        subtotalCents: orderSubtotalCents,
        syncStatus: isOfflineMode ? 'PENDING_LOCAL' : 'SYNCED',
        originNode: isOfflineMode ? 'LOCAL_WIFI_SERVER_CONTINGENCY' : 'LOCAL_EDGE_SERVER',
      })
      .returning();

    const insertedItems = [];
    for (const vItem of validatedItemsToInsert) {
      const [inserted] = await db
        .insert(orderItems)
        .values({
          orderId: createdOrder.id,
          sessionId: session.id,
          productId: vItem.productId,
          stationCode: vItem.stationCode,
          productNameSnapshot: vItem.productNameSnapshot,
          productDescriptionSnapshot: vItem.productDescriptionSnapshot,
          unitPriceCentsSnapshot: vItem.unitPriceCentsSnapshot,
          quantity: vItem.quantity,
          selectedOptionsJson: vItem.selectedOptionsJson,
          addonsUnitCentsSnapshot: vItem.addonsUnitCentsSnapshot,
          lineTotalCents: vItem.lineTotalCents,
          notes: vItem.notes,
          status: vItem.status,
        })
        .returning();
      insertedItems.push(inserted);
    }

    await db.insert(orderStateHistory).values({
      orderId: createdOrder.id,
      previousStatus: 'NONE',
      newStatus: initialOrderStatus,
      changedByName: params.actorName,
      changedByRole: params.actorRole,
      reason: `Pedido #${nextOrderNumber} registrado via ${params.origin}`,
    });

    await recalculateAccountTotals(session.id);

    await enqueueSyncEvent({
      entityType: 'ORDER',
      entityGlobalId: orderGlobalId,
      operation: 'CREATE_ORDER',
      payload: {
        orderNumber: nextOrderNumber,
        tableCode: table.code,
        subtotalCents: orderSubtotalCents,
        origin: params.origin,
        idempotencyKey: params.idempotencyKey.trim(),
      },
      authorityDomain: 'LOCAL_OPERATIONAL',
      isOfflineMode,
    });

    await logAudit({
      establishmentId: session.establishmentId,
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'ORDER_CREATED',
      entityType: 'ORDER',
      entityId: String(createdOrder.id),
      tableCode: table.code,
      details: {
        orderNumber: nextOrderNumber,
        origin: params.origin,
        subtotalCents: orderSubtotalCents,
        itemCount: insertedItems.length,
        syncStatus: createdOrder.syncStatus,
      },
    });

    return {
      order: createdOrder,
      items: insertedItems,
      idempotentReplay: false,
    };
  } catch (error: any) {
    console.error('Error creating order:', error);
    throw new Error(error.message || 'Falha ao processar pedido.', { cause: error });
  }
}

export async function updateOrderItemStatus(params: {
  orderItemId: number;
  newStatus: 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  actorUserId?: number | null;
  actorName: string;
  actorRole: string;
  reason?: string;
}) {
  try {
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, params.orderItemId));

    if (!item) {
      throw new Error('Item do pedido não encontrado.');
    }

    // After preparation starts, cancellation requires ADMIN or WAITER with explicit reason
    if (params.newStatus === 'CANCELLED') {
      if (params.actorRole !== 'ADMIN' && params.actorRole !== 'SUPER_ADMIN' && params.actorRole !== 'WAITER') {
        throw new Error('Apenas garçom autorizado ou gerente podem cancelar um item.');
      }
      if (!params.reason || params.reason.trim().length < 4) {
        throw new Error('Informe o motivo de auditoria para cancelar o item.');
      }
    }

    const previousStatus = item.status;
    const now = new Date();

    const [updatedItem] = await db
      .update(orderItems)
      .set({
        status: params.newStatus,
        preparedByUserId: params.actorUserId ?? item.preparedByUserId,
        readyAt: params.newStatus === 'READY' ? now : item.readyAt,
        deliveredAt: params.newStatus === 'DELIVERED' ? now : item.deliveredAt,
      })
      .where(eq(orderItems.id, item.id))
      .returning();

    await db.insert(orderStateHistory).values({
      orderId: item.orderId,
      orderItemId: item.id,
      previousStatus,
      newStatus: params.newStatus,
      changedByName: params.actorName,
      changedByRole: params.actorRole,
      reason: params.reason || `Item "${item.productNameSnapshot}" alterado para ${params.newStatus}`,
    });

    // Recompute parent order aggregate status WITHOUT marking other items ready!
    const siblingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, item.orderId));

    const activeSiblings = siblingItems.filter((i) => i.status !== 'CANCELLED');
    let aggregateOrderStatus = 'CONFIRMED';

    if (activeSiblings.length === 0) {
      aggregateOrderStatus = 'CANCELLED';
    } else if (activeSiblings.every((i) => i.status === 'DELIVERED')) {
      aggregateOrderStatus = 'DELIVERED';
    } else if (activeSiblings.every((i) => i.status === 'READY' || i.status === 'DELIVERED')) {
      aggregateOrderStatus = 'READY';
    } else if (
      activeSiblings.some(
        (i) => i.status === 'PREPARING' || i.status === 'READY' || i.status === 'DELIVERED'
      )
    ) {
      aggregateOrderStatus = 'PREPARING';
    } else if (activeSiblings.some((i) => i.status === 'RECEIVED')) {
      aggregateOrderStatus = 'RECEIVED';
    }

    const [updatedOrder] = await db
      .update(orders)
      .set({
        status: aggregateOrderStatus,
        cancelledReason:
          aggregateOrderStatus === 'CANCELLED' ? params.reason || 'Itens cancelados' : null,
        updatedAt: now,
      })
      .where(eq(orders.id, item.orderId))
      .returning();

    await recalculateAccountTotals(item.sessionId);

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, updatedOrder.tableId));

    await logAudit({
      establishmentId: updatedOrder.establishmentId,
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: `ORDER_ITEM_STATUS_${params.newStatus}`,
      entityType: 'ORDER_ITEM',
      entityId: String(item.id),
      tableCode: table?.code,
      details: {
        orderId: item.orderId,
        orderNumber: updatedOrder.orderNumber,
        productName: item.productNameSnapshot,
        stationCode: item.stationCode,
        previousStatus,
        newStatus: params.newStatus,
        reason: params.reason,
      },
    });

    return { updatedItem, updatedOrder, tableCode: table?.code };
  } catch (error: any) {
    console.error('Error updating order item status:', error);
    throw new Error(error.message || 'Falha ao atualizar estado do item.', { cause: error });
  }
}

export async function registerPaymentTransaction(params: {
  sessionId: number;
  method: 'CASH' | 'CARD_CREDIT' | 'CARD_DEBIT' | 'PIX';
  amountCents: number;
  confirmationType: 'MANUAL_CASHIER' | 'PROVIDER_CONFIRMED';
  providerName?: string;
  providerTransactionId?: string;
  cardBrandLast4?: string;
  splitPartLabel?: string;
  idempotencyKey: string;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    if (
      params.actorRole !== 'CASHIER' &&
      params.actorRole !== 'ADMIN' &&
      params.actorRole !== 'SUPER_ADMIN'
    ) {
      throw new Error('Apenas operadores de caixa ou administradores podem registrar pagamentos.');
    }

    if (params.amountCents <= 0) {
      throw new Error('O valor do pagamento deve ser maior que zero.');
    }

    // Check payment idempotency
    const existingPayment = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, params.idempotencyKey.trim()));
    if (existingPayment.length > 0) {
      const account = await recalculateAccountTotals(params.sessionId);
      return { payment: existingPayment[0], account, idempotentReplay: true };
    }

    // Verify electronic provider confirmation rule
    if (
      params.confirmationType === 'PROVIDER_CONFIRMED' &&
      (!params.providerTransactionId || params.providerTransactionId.trim().length < 4)
    ) {
      throw new Error(
        'Para declarar pagamento eletrônico confirmado por provedor, o código NSU/E2E de evidência do provedor é obrigatório.'
      );
    }

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.sessionId, params.sessionId));
    if (!account) {
      throw new Error('Conta da sessão não encontrada.');
    }

    const [est] = await db
      .select()
      .from(establishments)
      .where(eq(establishments.id, account.establishmentId));

    if (!est?.allowPartialPayments && params.amountCents < account.balanceCents) {
      throw new Error('Pagamentos parciais estão desabilitados nas configurações do estabelecimento.');
    }

    const isOfflineMode = est?.operationMode === 'LOCAL_OFFLINE_CONTINGENCY';
    const paymentGlobalId = `PAY-${crypto.randomUUID()}`;

    const [payment] = await db
      .insert(payments)
      .values({
        globalId: paymentGlobalId,
        accountId: account.id,
        sessionId: params.sessionId,
        establishmentId: account.establishmentId,
        method: params.method,
        amountCents: params.amountCents,
        confirmationType: params.confirmationType,
        providerName: params.providerName || (params.confirmationType === 'MANUAL_CASHIER' ? 'Conferência Presencial Caixa' : ' Stone / Bacen Pix'),
        providerTransactionId: params.providerTransactionId || '',
        cardBrandLast4: (params.cardBrandLast4 || '').slice(0, 18),
        status: 'CONFIRMED',
        splitPartLabel: params.splitPartLabel || 'Integral',
        registeredByUserId: params.actorUserId,
        registeredByName: params.actorName,
        idempotencyKey: params.idempotencyKey.trim(),
        syncStatus: isOfflineMode ? 'PENDING_LOCAL' : 'SYNCED',
      })
      .returning();

    const updatedAccount = await recalculateAccountTotals(params.sessionId);

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, account.tableId));

    await enqueueSyncEvent({
      entityType: 'PAYMENT',
      entityGlobalId: paymentGlobalId,
      operation: 'REGISTER_PAYMENT',
      payload: {
        sessionId: params.sessionId,
        method: params.method,
        amountCents: params.amountCents,
        confirmationType: params.confirmationType,
        idempotencyKey: params.idempotencyKey.trim(),
      },
      authorityDomain: 'LOCAL_OPERATIONAL',
      isOfflineMode,
    });

    await logAudit({
      establishmentId: account.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'PAYMENT_REGISTERED',
      entityType: 'PAYMENT',
      entityId: String(payment.id),
      tableCode: table?.code,
      details: {
        method: params.method,
        amountCents: params.amountCents,
        confirmationType: params.confirmationType,
        remainingBalanceCents: updatedAccount.balanceCents,
      },
    });

    return { payment, account: updatedAccount, idempotentReplay: false };
  } catch (error: any) {
    console.error('Error registering payment:', error);
    throw new Error(error.message || 'Falha ao registrar pagamento.', { cause: error });
  }
}

export async function refundPaymentTransaction(params: {
  paymentId: number;
  reason: string;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    if (
      params.actorRole !== 'CASHIER' &&
      params.actorRole !== 'ADMIN' &&
      params.actorRole !== 'SUPER_ADMIN'
    ) {
      throw new Error('Sem permissão para estornar pagamentos.');
    }
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('O estorno exige justificativa detalhada para auditoria financeira.');
    }

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, params.paymentId));
    if (!payment) {
      throw new Error('Pagamento não encontrado.');
    }
    if (payment.status === 'REFUNDED') {
      throw new Error('Este lançamento já foi estornado anteriormente.');
    }

    const [updatedPayment] = await db
      .update(payments)
      .set({
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundedByName: params.actorName,
        refundReason: params.reason.trim(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    const updatedAccount = await recalculateAccountTotals(payment.sessionId);

    await logAudit({
      establishmentId: payment.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'PAYMENT_REFUNDED',
      entityType: 'PAYMENT',
      entityId: String(payment.id),
      details: {
        amountCents: payment.amountCents,
        method: payment.method,
        reason: params.reason.trim(),
      },
    });

    return { payment: updatedPayment, account: updatedAccount };
  } catch (error: any) {
    console.error('Error refunding payment:', error);
    throw new Error(error.message || 'Falha ao processar estorno.', { cause: error });
  }
}

export async function closeTableSessionAndAccount(params: {
  sessionId: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    if (
      params.actorRole !== 'CASHIER' &&
      params.actorRole !== 'ADMIN' &&
      params.actorRole !== 'SUPER_ADMIN'
    ) {
      throw new Error('Apenas o Caixa ou Administrador podem concluir o fechamento financeiro da conta.');
    }

    const updatedAccount = await recalculateAccountTotals(params.sessionId);

    if (updatedAccount.balanceCents > 0) {
      throw new Error(
        `Encerramento bloqueado: Ainda há saldo pendente de R$ ${(updatedAccount.balanceCents / 100).toFixed(2)}. Registre o pagamento antes de liberar a mesa.`
      );
    }

    const sessionOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.sessionId, params.sessionId));

    const pendingKitchenOrders = sessionOrders.filter(
      (o) => o.status === 'RECEIVED' || o.status === 'PREPARING'
    );
    if (pendingKitchenOrders.length > 0) {
      throw new Error(
        `Encerramento bloqueado: Existem ${pendingKitchenOrders.length} pedido(s) ainda em preparo ou aguardando confirmação (#${pendingKitchenOrders.map((o) => o.orderNumber).join(', #')}). Entregue ou cancele antes de fechar a mesa.`
      );
    }

    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, params.sessionId));
    if (!session) throw new Error('Sessão não encontrada.');

    const now = new Date();

    const [closedSession] = await db
      .update(tableSessions)
      .set({
        status: 'CLOSED',
        closedByUserId: params.actorUserId,
        closedAt: now,
        revokedAt: now,
        serviceCallActive: false,
        billRequested: false,
      })
      .where(eq(tableSessions.id, session.id))
      .returning();

    await db
      .update(accounts)
      .set({
        status: 'CLOSED',
        updatedAt: now,
      })
      .where(eq(accounts.id, updatedAccount.id));

    const [releasedTable] = await db
      .update(restaurantTables)
      .set({
        status: 'AVAILABLE',
        activeSessionId: null,
        mergedIntoTableId: null,
        updatedAt: now,
      })
      .where(eq(restaurantTables.id, session.tableId))
      .returning();

    // Also release any secondary tables that were merged into this table
    const allTables = await db.select().from(restaurantTables);
    for (const t of allTables) {
      if (t.mergedIntoTableId === session.tableId) {
        await db
          .update(restaurantTables)
          .set({
            status: 'AVAILABLE',
            mergedIntoTableId: null,
            activeSessionId: null,
            updatedAt: now,
          })
          .where(eq(restaurantTables.id, t.id));
      }
    }

    await logAudit({
      establishmentId: session.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'SESSION_CLOSED_AND_CREDENTIALS_REVOKED',
      entityType: 'TABLE_SESSION',
      entityId: String(session.id),
      tableCode: releasedTable?.code,
      details: {
        totalPaidCents: updatedAccount.paidCents,
        revokedAccessCode: session.accessCode,
      },
    });

    return { closedSession, releasedTable, account: updatedAccount };
  } catch (error: any) {
    console.error('Error closing table session:', error);
    throw new Error(error.message || 'Falha ao encerrar conta e liberar mesa.', { cause: error });
  }
}

export async function transferTableSession(params: {
  sessionId: number;
  targetTableId: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, params.sessionId));
    if (!session || session.status !== 'ACTIVE') {
      throw new Error('Sessão de origem não está ativa.');
    }

    const [sourceTable] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, session.tableId));

    const [targetTable] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, params.targetTableId));

    if (!targetTable || targetTable.status !== 'AVAILABLE' || targetTable.activeSessionId !== null) {
      throw new Error('A mesa de destino precisa estar Disponível para receber a transferência.');
    }

    const now = new Date();

    await db
      .update(restaurantTables)
      .set({ status: 'AVAILABLE', activeSessionId: null, updatedAt: now })
      .where(eq(restaurantTables.id, session.tableId));

    await db
      .update(restaurantTables)
      .set({ status: 'OCCUPIED', activeSessionId: session.id, updatedAt: now })
      .where(eq(restaurantTables.id, targetTable.id));

    await db
      .update(tableSessions)
      .set({
        tableId: targetTable.id,
        transferredFromTableCode: sourceTable?.code || '',
      })
      .where(eq(tableSessions.id, session.id));

    await db
      .update(accounts)
      .set({ tableId: targetTable.id, updatedAt: now })
      .where(eq(accounts.sessionId, session.id));

    await db
      .update(orders)
      .set({ tableId: targetTable.id, updatedAt: now })
      .where(eq(orders.sessionId, session.id));

    await logAudit({
      establishmentId: session.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'TABLE_TRANSFERRED',
      entityType: 'TABLE_SESSION',
      entityId: String(session.id),
      tableCode: targetTable.code,
      details: {
        fromTable: sourceTable?.code,
        toTable: targetTable.code,
      },
    });

    return { fromTable: sourceTable?.code, toTable: targetTable.code };
  } catch (error: any) {
    console.error('Error transferring table:', error);
    throw new Error(error.message || 'Falha ao transferir mesa.', { cause: error });
  }
}

export async function mergeTablesIntoSession(params: {
  primarySessionId: number;
  secondaryTableId: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
}) {
  try {
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, params.primarySessionId));
    if (!session || session.status !== 'ACTIVE') {
      throw new Error('Sessão principal não encontrada ou inativa.');
    }

    const [secondaryTable] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, params.secondaryTableId));

    if (!secondaryTable || secondaryTable.status !== 'AVAILABLE') {
      throw new Error('A mesa secundária para junção deve estar Disponível.');
    }

    const existingMerged = session.mergedTableCodes
      ? session.mergedTableCodes.split(',').filter(Boolean)
      : [];
    if (!existingMerged.includes(secondaryTable.code)) {
      existingMerged.push(secondaryTable.code);
    }

    await db
      .update(restaurantTables)
      .set({
        status: 'OCCUPIED',
        mergedIntoTableId: session.tableId,
        activeSessionId: session.id,
        updatedAt: new Date(),
      })
      .where(eq(restaurantTables.id, secondaryTable.id));

    await db
      .update(tableSessions)
      .set({
        mergedTableCodes: existingMerged.join(','),
      })
      .where(eq(tableSessions.id, session.id));

    await logAudit({
      establishmentId: session.establishmentId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'TABLES_MERGED',
      entityType: 'TABLE_SESSION',
      entityId: String(session.id),
      tableCode: secondaryTable.code,
      details: {
        mergedTableCodes: existingMerged,
      },
    });

    return { mergedTableCodes: existingMerged };
  } catch (error: any) {
    console.error('Error merging tables:', error);
    throw new Error(error.message || 'Falha ao juntar mesas.', { cause: error });
  }
}

export async function reconcilePendingSyncEvents(params: {
  actorUserId?: number | null;
  actorName: string;
  actorRole: string;
}) {
  try {
    const [est] = await db.select().from(establishments).limit(1);
    if (!est) throw new Error('Estabelecimento não encontrado.');

    const pendingEvents = await db
      .select()
      .from(syncEvents)
      .where(eq(syncEvents.status, 'PENDING'));

    const now = new Date();
    let syncedCount = 0;

    for (const evt of pendingEvents) {
      await db
        .update(syncEvents)
        .set({
          status: 'SYNCED',
          syncedAt: now,
          lastAttemptAt: now,
          conflictResolutionNotes:
            evt.authorityDomain === 'LOCAL_OPERATIONAL'
              ? 'Sincronizado com nuvem: Autoridade operacional local preservada (idempotência verificada).'
              : 'Sincronizado com nuvem: Catálogo reconciliado sem sobrescrever pedidos antigos.',
        })
        .where(eq(syncEvents.id, evt.id));
      syncedCount++;
    }

    // Also mark any PENDING_LOCAL orders and payments as SYNCED
    await db
      .update(orders)
      .set({ syncStatus: 'SYNCED', updatedAt: now })
      .where(eq(orders.syncStatus, 'PENDING_LOCAL'));

    await db
      .update(payments)
      .set({ syncStatus: 'SYNCED' })
      .where(eq(payments.syncStatus, 'PENDING_LOCAL'));

    const [updatedEst] = await db
      .update(establishments)
      .set({
        operationMode: 'ONLINE_SYNCED',
        lastCloudSyncAt: now,
        updatedAt: now,
      })
      .where(eq(establishments.id, est.id))
      .returning();

    await logAudit({
      establishmentId: est.id,
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: 'CLOUD_SYNC_RECONCILED',
      entityType: 'SYNC_ENGINE',
      entityId: String(est.id),
      details: {
        reconciledEventsCount: syncedCount,
        timestamp: now.toISOString(),
      },
    });

    return { syncedCount, establishment: updatedEst };
  } catch (error: any) {
    console.error('Error reconciling sync events:', error);
    throw new Error('Falha ao reconciliar fila de sincronização.', { cause: error });
  }
}

export async function getFullOperationalSnapshot() {
  try {
    const est = await ensureSeedData();
    const allTables = await db.select().from(restaurantTables);
    const allSessions = await db
      .select()
      .from(tableSessions)
      .orderBy(desc(tableSessions.openedAt));
    const allCategories = await db.select().from(categories);
    const allProducts = await db.select().from(products);
    const allStations = await db.select().from(prepStations);
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const allOrderItems = await db.select().from(orderItems);
    const allAccounts = await db.select().from(accounts);
    const allPayments = await db.select().from(payments).orderBy(desc(payments.createdAt));
    const allUsers = await db.select().from(users);
    const recentSyncEvents = await db
      .select()
      .from(syncEvents)
      .orderBy(desc(syncEvents.sequenceNumber))
      .limit(50);
    const recentAuditLogs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(80);

    return {
      establishment: est,
      tables: allTables.sort((a, b) => a.number - b.number),
      sessions: allSessions,
      categories: allCategories.sort((a, b) => a.sortOrder - b.sortOrder),
      products: allProducts,
      stations: allStations,
      orders: allOrders,
      orderItems: allOrderItems,
      accounts: allAccounts,
      payments: allPayments,
      users: allUsers,
      syncEvents: recentSyncEvents,
      auditLogs: recentAuditLogs,
    };
  } catch (error: any) {
    console.error('Error getting operational snapshot:', error);
    throw new Error('Falha ao carregar estado operacional do banco de dados.', { cause: error });
  }
}
