import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import * as schema from './schema.ts';

dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
  var _pgliteInstance: PGlite | undefined;
  var _localSchemaInitialized: boolean | undefined;
}

const hasExternalPostgres = Boolean(process.env.SQL_HOST && process.env.SQL_HOST.trim() !== '');

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const createLocalPglite = () => {
  if (!global._pgliteInstance) {
    console.log(
      '[BANCO LOCAL] SQL_HOST nao definido — iniciando motor PostgreSQL 16 embarcado em ./.local-pgdata'
    );
    global._pgliteInstance = new PGlite('./.local-pgdata');
  }
  return global._pgliteInstance;
};

export const pool = hasExternalPostgres ? createPool() : (null as unknown as Pool);

export const db: ReturnType<typeof drizzle<typeof schema>> = hasExternalPostgres
  ? drizzle(pool, { schema })
  : (drizzlePglite(createLocalPglite(), { schema }) as unknown as ReturnType<
      typeof drizzle<typeof schema>
    >);

export async function ensureLocalSchemaIfNeeded() {
  if (hasExternalPostgres || global._localSchemaInitialized) return;
  const pg = createLocalPglite();
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS establishments (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      address TEXT NOT NULL,
      require_waiter_confirmation BOOLEAN NOT NULL DEFAULT false,
      service_fee_percent INTEGER NOT NULL DEFAULT 10,
      allow_partial_payments BOOLEAN NOT NULL DEFAULT true,
      allow_bill_split BOOLEAN NOT NULL DEFAULT true,
      allow_table_merge BOOLEAN NOT NULL DEFAULT true,
      session_ttl_minutes INTEGER NOT NULL DEFAULT 240,
      max_auth_attempts INTEGER NOT NULL DEFAULT 5,
      operation_mode TEXT NOT NULL DEFAULT 'ONLINE_SYNCED',
      last_cloud_sync_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'WAITER',
      station_code TEXT DEFAULT 'COZINHA',
      pin_code TEXT NOT NULL DEFAULT '1234',
      active BOOLEAN NOT NULL DEFAULT true,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prep_stations (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id)
    );

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      number INTEGER NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      sector TEXT NOT NULL DEFAULT 'Salão Principal',
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      notes TEXT DEFAULT '',
      merged_into_table_id INTEGER,
      active_session_id INTEGER,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS table_sessions (
      id SERIAL PRIMARY KEY,
      global_id TEXT NOT NULL UNIQUE,
      table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
      closed_by_user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      guest_count INTEGER NOT NULL DEFAULT 2,
      access_code TEXT NOT NULL UNIQUE,
      access_password TEXT NOT NULL,
      qr_token TEXT NOT NULL UNIQUE,
      session_secret_token TEXT NOT NULL UNIQUE,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      service_call_active BOOLEAN NOT NULL DEFAULT false,
      service_call_reason TEXT DEFAULT '',
      bill_requested BOOLEAN NOT NULL DEFAULT false,
      split_count INTEGER NOT NULL DEFAULT 1,
      transferred_from_table_code TEXT,
      merged_table_codes TEXT DEFAULT '',
      opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMP,
      revoked_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      active BOOLEAN NOT NULL DEFAULT true,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      station_code TEXT NOT NULL DEFAULT 'COZINHA',
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      promo_price_cents INTEGER,
      promotional BOOLEAN NOT NULL DEFAULT false,
      featured BOOLEAN NOT NULL DEFAULT false,
      available BOOLEAN NOT NULL DEFAULT true,
      prep_time_minutes INTEGER NOT NULL DEFAULT 15,
      image_url TEXT NOT NULL,
      ingredients TEXT NOT NULL DEFAULT '',
      allergens TEXT NOT NULL DEFAULT '',
      option_groups_json TEXT NOT NULL DEFAULT '[]',
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      global_id TEXT NOT NULL UNIQUE,
      order_number INTEGER NOT NULL,
      session_id INTEGER NOT NULL REFERENCES table_sessions(id),
      table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      origin TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      created_by_label TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      notes TEXT DEFAULT '',
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      cancelled_reason TEXT,
      cancelled_by_user_id INTEGER REFERENCES users(id),
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      origin_node TEXT NOT NULL DEFAULT 'LOCAL_EDGE_SERVER',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      session_id INTEGER NOT NULL REFERENCES table_sessions(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      station_code TEXT NOT NULL DEFAULT 'COZINHA',
      product_name_snapshot TEXT NOT NULL,
      product_description_snapshot TEXT NOT NULL,
      unit_price_cents_snapshot INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      selected_options_json TEXT NOT NULL DEFAULT '[]',
      addons_unit_cents_snapshot INTEGER NOT NULL DEFAULT 0,
      line_total_cents INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      prepared_by_user_id INTEGER REFERENCES users(id),
      ready_at TIMESTAMP,
      delivered_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_state_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      order_item_id INTEGER REFERENCES order_items(id),
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      changed_by_name TEXT NOT NULL,
      changed_by_role TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL UNIQUE REFERENCES table_sessions(id),
      table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      status TEXT NOT NULL DEFAULT 'OPEN',
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      service_fee_enabled BOOLEAN NOT NULL DEFAULT true,
      service_fee_cents INTEGER NOT NULL DEFAULT 0,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      discount_reason TEXT DEFAULT '',
      discount_authorized_by TEXT DEFAULT '',
      surcharge_cents INTEGER NOT NULL DEFAULT 0,
      surcharge_reason TEXT DEFAULT '',
      total_cents INTEGER NOT NULL DEFAULT 0,
      paid_cents INTEGER NOT NULL DEFAULT 0,
      refunded_cents INTEGER NOT NULL DEFAULT 0,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      split_count INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      global_id TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      session_id INTEGER NOT NULL REFERENCES table_sessions(id),
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      method TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      confirmation_type TEXT NOT NULL DEFAULT 'MANUAL_CASHIER',
      provider_name TEXT DEFAULT '',
      provider_transaction_id TEXT DEFAULT '',
      card_brand_last4 TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      split_part_label TEXT DEFAULT 'Integral',
      registered_by_user_id INTEGER NOT NULL REFERENCES users(id),
      registered_by_name TEXT NOT NULL,
      refunded_at TIMESTAMP,
      refunded_by_name TEXT,
      refund_reason TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      sync_status TEXT NOT NULL DEFAULT 'SYNCED',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id SERIAL PRIMARY KEY,
      event_global_id TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      entity_global_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      origin_node TEXT NOT NULL DEFAULT 'LOCAL_SERVER_01',
      authority_domain TEXT NOT NULL DEFAULT 'LOCAL_OPERATIONAL',
      sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'SYNCED',
      conflict_resolution_notes TEXT DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id),
      actor_user_id INTEGER,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      table_code TEXT DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  global._localSchemaInitialized = true;
}
