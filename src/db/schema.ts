import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const establishments = pgTable('establishments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  tradeName: text('trade_name').notNull(),
  cnpj: text('cnpj').notNull(),
  address: text('address').notNull(),
  requireWaiterConfirmation: boolean('require_waiter_confirmation').notNull().default(false),
  serviceFeePercent: integer('service_fee_percent').notNull().default(10),
  allowPartialPayments: boolean('allow_partial_payments').notNull().default(true),
  allowBillSplit: boolean('allow_bill_split').notNull().default(true),
  allowTableMerge: boolean('allow_table_merge').notNull().default(true),
  sessionTtlMinutes: integer('session_ttl_minutes').notNull().default(240),
  maxAuthAttempts: integer('max_auth_attempts').notNull().default(5),
  operationMode: text('operation_mode').notNull().default('ONLINE_SYNCED'), // ONLINE_SYNCED | LOCAL_OFFLINE_CONTINGENCY
  lastCloudSyncAt: timestamp('last_cloud_sync_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('WAITER'), // SUPER_ADMIN | ADMIN | WAITER | KITCHEN | CASHIER
  stationCode: text('station_code').default('COZINHA'),
  pinCode: text('pin_code').notNull().default('1234'),
  active: boolean('active').notNull().default(true),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const prepStations = pgTable('prep_stations', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  active: boolean('active').notNull().default(true),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
});

export const restaurantTables = pgTable('restaurant_tables', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  number: integer('number').notNull(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(4),
  sector: text('sector').notNull().default('Salão Principal'),
  status: text('status').notNull().default('AVAILABLE'), // AVAILABLE | OCCUPIED | WAITING_SERVICE | WAITING_PAYMENT | CLOSING | MAINTENANCE
  notes: text('notes').default(''),
  mergedIntoTableId: integer('merged_into_table_id'),
  activeSessionId: integer('active_session_id'),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tableSessions = pgTable('table_sessions', {
  id: serial('id').primaryKey(),
  globalId: text('global_id').notNull().unique(),
  tableId: integer('table_id')
    .references(() => restaurantTables.id)
    .notNull(),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  openedByUserId: integer('opened_by_user_id')
    .references(() => users.id)
    .notNull(),
  closedByUserId: integer('closed_by_user_id').references(() => users.id),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | CLOSING | CLOSED | REVOKED
  guestCount: integer('guest_count').notNull().default(2),
  accessCode: text('access_code').notNull().unique(),
  accessPassword: text('access_password').notNull(),
  qrToken: text('qr_token').notNull().unique(),
  sessionSecretToken: text('session_secret_token').notNull().unique(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  expiresAt: timestamp('expires_at').notNull(),
  serviceCallActive: boolean('service_call_active').notNull().default(false),
  serviceCallReason: text('service_call_reason').default(''),
  billRequested: boolean('bill_requested').notNull().default(false),
  splitCount: integer('split_count').notNull().default(1),
  transferredFromTableCode: text('transferred_from_table_code'),
  mergedTableCodes: text('merged_table_codes').default(''),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
  revokedAt: timestamp('revoked_at'),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull().default(1),
  active: boolean('active').notNull().default(true),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .references(() => categories.id)
    .notNull(),
  stationCode: text('station_code').notNull().default('COZINHA'), // COZINHA | BAR | PIZZARIA | SOBREMESAS
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceCents: integer('price_cents').notNull(),
  promoPriceCents: integer('promo_price_cents'),
  promotional: boolean('promotional').notNull().default(false),
  featured: boolean('featured').notNull().default(false),
  available: boolean('available').notNull().default(true),
  prepTimeMinutes: integer('prep_time_minutes').notNull().default(15),
  imageUrl: text('image_url').notNull(),
  ingredients: text('ingredients').notNull().default(''),
  allergens: text('allergens').notNull().default(''),
  optionGroupsJson: text('option_groups_json').notNull().default('[]'),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    globalId: text('global_id').notNull().unique(),
    orderNumber: integer('order_number').notNull(),
    sessionId: integer('session_id')
      .references(() => tableSessions.id)
      .notNull(),
    tableId: integer('table_id')
      .references(() => restaurantTables.id)
      .notNull(),
    establishmentId: integer('establishment_id')
      .references(() => establishments.id)
      .notNull(),
    origin: text('origin').notNull(), // CLIENT | WAITER
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdByLabel: text('created_by_label').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('RECEIVED'), // RECEIVED | CONFIRMED | PREPARING | READY | DELIVERED | CANCELLED
    priority: text('priority').notNull().default('NORMAL'), // NORMAL | HIGH
    notes: text('notes').default(''),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    cancelledReason: text('cancelled_reason'),
    cancelledByUserId: integer('cancelled_by_user_id').references(() => users.id),
    syncStatus: text('sync_status').notNull().default('SYNCED'), // SYNCED | PENDING_LOCAL | CONFLICT_RESOLVED
    originNode: text('origin_node').notNull().default('LOCAL_EDGE_SERVER'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('orders_idempotency_key_idx').on(table.idempotencyKey),
  })
);

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  sessionId: integer('session_id')
    .references(() => tableSessions.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  stationCode: text('station_code').notNull().default('COZINHA'),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  productDescriptionSnapshot: text('product_description_snapshot').notNull(),
  unitPriceCentsSnapshot: integer('unit_price_cents_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  selectedOptionsJson: text('selected_options_json').notNull().default('[]'),
  addonsUnitCentsSnapshot: integer('addons_unit_cents_snapshot').notNull().default(0),
  lineTotalCents: integer('line_total_cents').notNull(),
  notes: text('notes').default(''),
  status: text('status').notNull().default('CONFIRMED'), // RECEIVED | CONFIRMED | PREPARING | READY | DELIVERED | CANCELLED
  preparedByUserId: integer('prepared_by_user_id').references(() => users.id),
  readyAt: timestamp('ready_at'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderStateHistory = pgTable('order_state_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  previousStatus: text('previous_status').notNull(),
  newStatus: text('new_status').notNull(),
  changedByName: text('changed_by_name').notNull(),
  changedByRole: text('changed_by_role').notNull(),
  reason: text('reason').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => tableSessions.id)
    .notNull()
    .unique(),
  tableId: integer('table_id')
    .references(() => restaurantTables.id)
    .notNull(),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN | WAITING_PAYMENT | PAID | CLOSED
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  serviceFeeEnabled: boolean('service_fee_enabled').notNull().default(true),
  serviceFeeCents: integer('service_fee_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  discountReason: text('discount_reason').default(''),
  discountAuthorizedBy: text('discount_authorized_by').default(''),
  surchargeCents: integer('surcharge_cents').notNull().default(0),
  surchargeReason: text('surcharge_reason').default(''),
  totalCents: integer('total_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  refundedCents: integer('refunded_cents').notNull().default(0),
  balanceCents: integer('balance_cents').notNull().default(0),
  splitCount: integer('split_count').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    globalId: text('global_id').notNull().unique(),
    accountId: integer('account_id')
      .references(() => accounts.id)
      .notNull(),
    sessionId: integer('session_id')
      .references(() => tableSessions.id)
      .notNull(),
    establishmentId: integer('establishment_id')
      .references(() => establishments.id)
      .notNull(),
    method: text('method').notNull(), // CASH | CARD_CREDIT | CARD_DEBIT | PIX
    amountCents: integer('amount_cents').notNull(),
    confirmationType: text('confirmation_type').notNull().default('MANUAL_CASHIER'), // MANUAL_CASHIER | PROVIDER_CONFIRMED
    providerName: text('provider_name').default(''),
    providerTransactionId: text('provider_transaction_id').default(''),
    cardBrandLast4: text('card_brand_last4').default(''), // Never full PAN
    status: text('status').notNull().default('CONFIRMED'), // CONFIRMED | REFUNDED
    splitPartLabel: text('split_part_label').default('Integral'),
    registeredByUserId: integer('registered_by_user_id')
      .references(() => users.id)
      .notNull(),
    registeredByName: text('registered_by_name').notNull(),
    refundedAt: timestamp('refunded_at'),
    refundedByName: text('refunded_by_name'),
    refundReason: text('refund_reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    syncStatus: text('sync_status').notNull().default('SYNCED'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdempotencyIdx: uniqueIndex('payments_idempotency_key_idx').on(table.idempotencyKey),
  })
);

export const syncEvents = pgTable('sync_events', {
  id: serial('id').primaryKey(),
  eventGlobalId: text('event_global_id').notNull().unique(),
  entityType: text('entity_type').notNull(), // ORDER | PAYMENT | SESSION | MENU_PRICE
  entityGlobalId: text('entity_global_id').notNull(),
  operation: text('operation').notNull(), // CREATE | UPDATE | STATE_TRANSITION | CONFLICT_CHECK
  payloadJson: text('payload_json').notNull(),
  originNode: text('origin_node').notNull().default('LOCAL_SERVER_01'),
  authorityDomain: text('authority_domain').notNull().default('LOCAL_OPERATIONAL'), // LOCAL_OPERATIONAL | CLOUD_CATALOG
  sequenceNumber: integer('sequence_number').notNull(),
  status: text('status').notNull().default('SYNCED'), // PENDING | SYNCED | CONFLICT_RESOLVED | FAILED
  conflictResolutionNotes: text('conflict_resolution_notes').default(''),
  attempts: integer('attempts').notNull().default(1),
  lastAttemptAt: timestamp('last_attempt_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  syncedAt: timestamp('synced_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  establishmentId: integer('establishment_id')
    .references(() => establishments.id)
    .notNull(),
  actorUserId: integer('actor_user_id'),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  tableCode: text('table_code').default(''),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));
