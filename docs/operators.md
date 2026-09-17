# Operator guide

## Run the guest lane

```bash
npm install
npm start
```

Browse to http://127.0.0.1:8787.

1. Leave the workflow on **Arcade Burgers**.
2. Send `I want an Arcade Burger meal, large, with a Coke, pickup`.
3. When the cashier quotes tax, send `Yes, place the order`.
4. Confirm a ticket appears under **Now serving** and the bag empties.

Scripted equivalent (used in CI):

```bash
npm run demo
```

Expected output includes `Ticket A### $11.90 pickup`.

## Switch brands

The Harbor Health workflow is a clinic front desk. Choose it in the left rail, then ask for a same-day sick visit or `Refill Rx 44019`.

## Live models

```bash
export OPENAI_API_KEY=...
export OPENAI_BASE_URL=https://api.openai.com/v1   # optional
export RHO_MODEL=gpt-4o-mini                       # optional
npm start
```

Policy still blocks non-allowlisted tools. The model cannot bash the box or invent a $0 burger; `add_to_cart` will reject unknown ids.

## Health

`GET /api/health` returns the active provider and workflow ids.
