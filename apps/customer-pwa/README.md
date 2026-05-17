# Customer PWA

A Progressive Web App (PWA) for customers to track orders, manage returns, and reorder.

## Features

- **Order Tracking** — Real-time shipment status and tracking
- **Returns Management** — Multi-step return flow with eligibility checks
- **Order History** — Quick reorder from past purchases
- **PWA Support** — Works offline, installable on mobile
- **JWT Authentication** — Secure token-based auth from checkout

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will start on http://localhost:3001

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Environment Variables

Create a `.env.local` file:

```
VITE_API_URL=https://pulseback.fly.dev
```

## Architecture

### Pages

- **Auth** (`/auth`) — Handles JWT extraction from URL and stores in localStorage
- **Track Order** (`/track/:orderId`) — Real-time order status and tracking
- **Returns** (`/returns`) — Multi-step return initiation flow
- **Reorder** (`/reorder`) — Browse order history and quick reorder

### Libraries

- **React 18** — UI framework
- **React Router** — Client-side routing
- **tRPC** — Type-safe API calls
- **React Query** — Server state management
- **Vite** — Build tool

### Auth Flow

1. Checkout completes → redirects to `/auth?jwt=...`
2. Auth page extracts JWT and validates expiry
3. Token stored in localStorage
4. Subsequent API calls include `Authorization: Bearer {token}` header
5. tRPC middleware validates token on each call

## Testing

### Track Order

1. Visit `/auth?jwt=<valid-jwt>`
2. JWT decoded and stored in localStorage
3. Redirected to `/track/latest`
4. Search for order by name and phone

### Returns Flow

1. Visit `/returns` (requires valid JWT)
2. Enter phone number to fetch order history
3. Select order → select items → enter reason → confirm
4. Return initiated, customer receives WA confirmation

## PWA Features

- Installable on iOS/Android
- Works offline (cached pages)
- Manifest-based configuration
- Service worker for caching

## Deployment

The app is deployed to `pulseback.app` and accessible to customers via:

1. Checkout redirect: `/auth?jwt=...`
2. Direct link: `https://pulseback.app/track/<orderId>`
3. Mobile home screen: Install as PWA
