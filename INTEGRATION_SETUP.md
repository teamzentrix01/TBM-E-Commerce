# Ecommerce and TBM integration

The two applications keep separate databases.

## Ecommerce environment

Configure these values in the ecommerce deployment:

```env
ECOM_DATABASE_URL=postgresql://.../buyzaarmart_ecommerce
ECOM_AUTH_SECRET=<at-least-32-random-characters>
OTP_DELIVERY_URL=<your-sms-adapter-endpoint>
OTP_DELIVERY_TOKEN=<provider-token>
TBM_INTEGRATION_KEY=<shared-random-key>
SYNC_PUBLIC_API_BASE_URL=https://sync.thebuyzaarmart.com
RAZORPAY_KEY_ID=<razorpay-key-id>
RAZORPAY_KEY_SECRET=<razorpay-key-secret>
RAZORPAY_WEBHOOK_SECRET=<razorpay-webhook-secret>
```

`ECOM_DATABASE_URL` must never point to the TBM/POS database.

For online payments, ecommerce creates a Razorpay order first, opens Razorpay
Checkout on the customer browser, verifies the returned signature on the server,
and only then moves the order to `pending_store_acceptance`. TBM never sees
unpaid `payment_pending` orders. Configure the Razorpay webhook URL as:

```text
https://shop.thebuzaarmart.com/api/payments/razorpay/webhook
```

## TBM environment

Configure these values in the TBM deployment:

```env
ECOMMERCE_API_BASE_URL=https://shop.thebuzaarmart.com
ECOMMERCE_INTEGRATION_KEY=<same-shared-random-key>
```

TBM reads and updates ecommerce orders through secured APIs. It does not create
ecommerce user, OTP, address, order, payment, or status tables. The only TBM
database write is the normal sales bill and inventory stock-out created when an
authorized store user generates the final receipt.

## Rollout

1. Create a dedicated ecommerce PostgreSQL database.
2. Deploy ecommerce with OTP delivery configured.
3. Test order creation against a non-production TBM environment.
4. Configure the two shared integration variables in TBM.
5. Verify store scoping with a store manager and all-store access with a super admin.
6. Run one COD, one UPI-on-delivery, and one Razorpay test payment before production release.
