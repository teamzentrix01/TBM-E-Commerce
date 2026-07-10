import { Pool } from 'pg';

const globalForPg = globalThis;

if (!globalForPg._pgPool) {
  const connectionString = process.env.ECOM_DATABASE_URL || '';
  const useSsl =
    process.env.ECOM_DB_SSL === 'true' ||
    /sslmode=require/i.test(connectionString);
  globalForPg._pgPool = new Pool({
    ...(connectionString
      ? { connectionString }
      : {
          host: process.env.ECOM_DB_HOST || process.env.DB_HOST || 'localhost',
          port: Number(process.env.ECOM_DB_PORT || process.env.DB_PORT) || 5432,
          database:
            process.env.ECOM_DB_NAME ||
            process.env.DB_NAME ||
            'buyzaarmart_ecommerce',
          user: process.env.ECOM_DB_USER || process.env.DB_USER || 'postgres',
          password:
            process.env.ECOM_DB_PASSWORD || process.env.DB_PASSWORD || '',
        }),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  globalForPg._pgPool.on('error', (err) => {
    console.error('PostgreSQL Pool Error:', err);
  });
}

const pool = globalForPg._pgPool;

export async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Ecom DB] ${duration}ms — ${text.substring(0, 80)}`);
    }
    return res;
  } catch (err) {
    console.error('[Ecom DB ERROR]', err.message, '\nQuery:', text);
    throw err;
  }
}

export async function getClient() {
  return await pool.connect();
}

/**
 * Ensures customer-facing data stays in the dedicated ecommerce database.
 */
let schemaInitialized = false;
export async function ensureEcommerceSchema() {
  if (schemaInitialized) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ecommerce_products (
        barcode VARCHAR(100) PRIMARY KEY,
        image_url TEXT,
        description TEXT,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_users (
        id BIGSERIAL PRIMARY KEY,
        phone VARCHAR(15) UNIQUE,
        name VARCHAR(160),
        email VARCHAR(255),
        phone_verified_at TIMESTAMPTZ,
        image_url TEXT,
        google_id VARCHAR(100) UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE ecommerce_users ALTER COLUMN phone DROP NOT NULL;
      ALTER TABLE ecommerce_users ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE ecommerce_users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100) UNIQUE;

      CREATE TABLE IF NOT EXISTS ecommerce_otp_challenges (
        id BIGSERIAL PRIMARY KEY,
        phone VARCHAR(15) NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        purpose VARCHAR(40) NOT NULL DEFAULT 'login',
        request_ip VARCHAR(80),
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES ecommerce_users(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent TEXT,
        request_ip VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_addresses (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES ecommerce_users(id) ON DELETE CASCADE,
        receiver_name VARCHAR(160) NOT NULL,
        receiver_phone VARCHAR(15) NOT NULL,
        address_line1 TEXT NOT NULL,
        address_line2 TEXT,
        landmark TEXT,
        city VARCHAR(120) NOT NULL,
        state VARCHAR(120),
        pincode VARCHAR(10) NOT NULL,
        label VARCHAR(40) NOT NULL DEFAULT 'Home',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_orders (
        id BIGSERIAL PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        user_id BIGINT NOT NULL REFERENCES ecommerce_users(id) ON DELETE RESTRICT,
        store_id BIGINT NOT NULL,
        store_name VARCHAR(255) NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'pending_store_acceptance',
        payment_method VARCHAR(40) NOT NULL,
        payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
        payment_reference VARCHAR(160),
        subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        delivery_slot VARCHAR(160),
        delivery_address JSONB NOT NULL,
        customer_note TEXT,
        rejection_reason TEXT,
        idempotency_key VARCHAR(120),
        tbm_bill_id BIGINT,
        tbm_bill_number VARCHAR(80),
        tbm_invoice_token VARCHAR(120),
        accepted_at TIMESTAMPTZ,
        packed_at TIMESTAMPTZ,
        dispatched_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS ecommerce_order_items (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
        product_id BIGINT NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        barcode VARCHAR(120),
        sku VARCHAR(120),
        image_url TEXT,
        unit VARCHAR(60),
        qty NUMERIC(14,3) NOT NULL,
        mrp NUMERIC(14,2) NOT NULL DEFAULT 0,
        selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(8,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_order_status_history (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
        from_status VARCHAR(40),
        to_status VARCHAR(40) NOT NULL,
        actor_type VARCHAR(30) NOT NULL,
        actor_id VARCHAR(120),
        note TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ecommerce_inventory_reservations (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
        store_id BIGINT NOT NULL,
        product_id BIGINT NOT NULL,
        qty NUMERIC(14,3) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        expires_at TIMESTAMPTZ,
        released_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(order_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS ecommerce_payments (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE RESTRICT,
        provider VARCHAR(40) NOT NULL,
        gateway_order_id VARCHAR(160) NOT NULL,
        gateway_payment_id VARCHAR(160),
        gateway_signature TEXT,
        status VARCHAR(40) NOT NULL DEFAULT 'created',
        amount NUMERIC(14,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payment_method_detail VARCHAR(40),
        refund_id VARCHAR(160),
        refund_status VARCHAR(40),
        provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        verified_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(order_id, provider),
        UNIQUE(provider, gateway_order_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ecommerce_otp_phone_created
        ON ecommerce_otp_challenges(phone, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ecommerce_sessions_user_active
        ON ecommerce_sessions(user_id, expires_at)
        WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_user_created
        ON ecommerce_orders(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_store_status
        ON ecommerce_orders(store_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ecommerce_reservations_store_product
        ON ecommerce_inventory_reservations(store_id, product_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ecommerce_payments_gateway_payment
        ON ecommerce_payments(provider, gateway_payment_id)
        WHERE gateway_payment_id IS NOT NULL;
    `);
    schemaInitialized = true;
    console.log('[Ecom DB] Schema verified/initialized.');
  } catch (err) {
    console.error('[Ecom DB] Failed to verify schema:', err);
    throw err;
  }
}

export default pool;
