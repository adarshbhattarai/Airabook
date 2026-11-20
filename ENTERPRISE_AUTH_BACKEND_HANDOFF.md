# Enterprise Authentication Backend Handoff

## Scope

The enterprise authentication workflow is implemented in the frontend under:

- `src/pages/auth/v2/EnterpriseSignup.jsx`
- `src/pages/auth/v2/EnterpriseLogin.jsx`
- `src/services/enterpriseOnboardingService.js`

Frontend routes:

- `/v2/enterprise-signup`
- `/v2/enterprise-login`

The current implementation uses demo HTTP endpoints. The response is not yet used to create a Firebase session or store a backend-issued token.

## Current demo API contract

### 1. Enterprise signup / onboarding

**Request**

```http
POST ${VITE_ENTERPRISE_DEMO_SIGNIN_URL || http://localhost:8000/signin}
Content-Type: application/json
```

```json
{
  "proposed_account_name": "Acme Corporation",
  "workspace_slug": "acme",
  "website": "https://acme.com",
  "country": "Nepal",
  "contact_person_name": "Jane Doe",
  "contact_email": "jane@acme.com",
  "phone": "+977 9800000000",
  "business_description": "How the organization plans to use Airabook...",
  "selected_plan": "enterprise",
  "billing_interval": "monthly",
  "subscription_amount": 99,
  "currency": "USD",
  "payment_status": "demo_successful"
}
```

**Expected response**

- HTTP `201 Created` is required by the current frontend.
- Any other status is treated as a failed submission.
- The frontend currently does not parse the response body.

**Important current behavior**

- `password` and `confirm_password` are collected by the UI but intentionally removed before this request is sent.
- Cardholder name, card number, expiry, CVC, billing country, and terms acceptance are collected by the UI but are not sent to this demo endpoint.
- `payment_status: "demo_successful"` is only a demo marker. It must not be treated as proof of a real payment in production.

### 2. Enterprise login

**Request**

```http
POST ${VITE_ENTERPRISE_DEMO_LOGIN_URL || http://localhost:8000/login}
Content-Type: application/json
```

```json
{
  "flow": "enterprise_login",
  "workspace_slug": "acme",
  "contact_email": "jane@acme.com",
  "password": "the-user-password"
}
```

**Expected response**

- HTTP `201 Created` is currently required by the frontend, although `200 OK` or `204 No Content` would be more conventional for a successful login and should be agreed with the backend team.
- The response body is currently ignored.
- The frontend navigates to `/v2/enterprise-home` after a successful response, so the production implementation must establish an authenticated session or return a token that the frontend can store and use.

## Frontend validation

### Signup fields

| Field | Required | Frontend validation |
|---|---:|---|
| `proposed_account_name` | Yes | Non-empty |
| `workspace_slug` | Yes | Lowercase letters, numbers, and hyphens only: `[a-z0-9-]+` |
| `website` | Yes | Valid URL format |
| `country` | Yes | Must select a country |
| `contact_person_name` | Yes | Non-empty |
| `phone` | Yes | Non-empty telephone input |
| `contact_email` | Yes | Valid email format |
| `business_description` | Yes | Minimum 20 characters |
| `password` | Yes | Minimum 8 characters; currently not transmitted |
| `confirm_password` | Yes | Must match `password`; currently not transmitted |

### Billing fields

The second signup step collects these fields:

| Field | Required | Current API behavior |
|---|---:|---|
| `cardholder_name` | Yes | Not sent |
| `card_number` | Yes | Not sent; demo-only UI value |
| `expiry` | Yes | Not sent; `MM/YY` format |
| `cvc` | Yes | Not sent; 3–4 digits |
| `billing_country` | Yes | Not sent |
| `terms_accepted` | Yes | Not sent |

The current payment submit handler sends the same onboarding payload and plan metadata as signup. It does not send the payment form values.

## APIs required for production

The backend team should provide or confirm the following APIs:

1. **Create enterprise workspace / onboarding request**
   - Accept the organization, workspace, contact, and business fields.
   - Validate workspace slug uniqueness and allowed characters.
   - Store credentials securely if the signup password is intended to create the admin account. Never store a plain-text password.
   - Return the created workspace/request ID and current status.

2. **Create or start enterprise subscription checkout**
   - Accept the selected plan and billing interval.
   - Create a Stripe Checkout Session or return a hosted payment URL.
   - Do not accept raw card details in the Airabook backend. Use Stripe Checkout or Stripe Elements/tokenization.
   - Return a checkout URL or client secret and a checkout/session ID.

3. **Confirm onboarding/payment status**
   - Return the current onboarding, subscription, and payment status by request/workspace ID.
   - Stripe webhook processing should be the source of truth for payment success.

4. **Enterprise login**
   - Validate workspace slug, email, and password.
   - Return an authenticated session/cookie or access token plus workspace/user information.

5. **Current session / enterprise workspace**
   - Return the authenticated enterprise user and workspace details after login.
   - Required by the enterprise home page once real authentication is connected.

6. **Logout / session refresh**
   - Invalidate the session and refresh short-lived access tokens if token-based authentication is used.

## Recommended production response shapes

### Signup response

```json
{
  "request_id": "onb_12345",
  "workspace_id": "ws_12345",
  "workspace_slug": "acme",
  "status": "payment_pending",
  "checkout_url": "https://checkout.stripe.com/..."
}
```

### Login response

```json
{
  "access_token": "<short-lived-token>",
  "refresh_token": "<refresh-token-or-secure-cookie>",
  "user": {
    "id": "user_12345",
    "email": "jane@acme.com",
    "name": "Jane Doe"
  },
  "workspace": {
    "id": "ws_12345",
    "slug": "acme",
    "name": "Acme Corporation",
    "status": "active"
  }
}
```

## Decisions needed from the backend team

- Should enterprise admin credentials be created during onboarding or through an invitation flow?
- Should authentication use Firebase Auth, backend-issued JWTs, or an HTTP-only session cookie?
- What is the canonical production endpoint naming: `/signin` vs `/signup`/`/onboarding`?
- Will Stripe Checkout be hosted, or will the frontend receive a Stripe client secret?
- What status codes and error response schema should the frontend handle?
- Which fields are authoritative for plan price and currency? The backend should calculate price from the plan, not trust the client-provided amount.
- What workspace states should the frontend display: `pending`, `payment_pending`, `active`, `suspended`, and so on?

## Security notes

- Do not accept or log raw card number or CVC values in the Airabook backend.
- Do not trust `subscription_amount`, `currency`, or `payment_status` from the browser for billing decisions.
- Hash passwords with a modern password hashing algorithm if the backend owns credentials.
- Validate workspace ownership and authorization on every enterprise workspace request.
- Return structured, non-sensitive error messages for duplicate workspace slugs and invalid credentials.
