import { id } from "../../core/ids.ts";
import {
  MENU,
  STORE,
  TAX_BPS,
  type Daypart,
  type FulfillmentMethod,
  type Size,
  findItem,
  formatCents,
  itemPrice,
  type MenuItem,
} from "./catalog.ts";

export interface CartLine {
  lineId: string;
  itemId: string;
  name: string;
  quantity: number;
  size?: Size;
  modifiers: string[];
  unitCents: number;
  lineCents: number;
  notes?: string;
}

export interface Cart {
  lines: CartLine[];
  promo?: { code: string; cents: number };
}

export interface Order {
  id: string;
  number: string;
  status: "received" | "preparing" | "ready" | "handed-off" | "cancelled";
  fulfillment: { method: FulfillmentMethod; notes?: string };
  lines: CartLine[];
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  createdAt: string;
  etaMinutes: number;
}

export interface OrderDraft {
  lines: CartLine[];
  fulfillment: { method: FulfillmentMethod; notes?: string };
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

export interface PlannerMemory {
  lastIntent?: string;
  pendingItems?: Array<{ query: string; quantity: number; size?: Size; modifiers: string[] }>;
  wantCombo?: boolean;
}

export interface ArcadeState {
  store: typeof STORE;
  daypart: Daypart;
  cart: Cart;
  fulfillment?: { method: FulfillmentMethod; notes?: string };
  customer: { name?: string; phone?: string; email?: string };
  pendingReview?: OrderDraft;
  orders: Order[];
  humanRequested?: boolean;
  planner: PlannerMemory;
}

export function createArcadeState(daypart: Daypart = "lunch"): ArcadeState {
  return {
    store: STORE,
    daypart,
    cart: { lines: [] },
    customer: {},
    orders: [],
    planner: {},
  };
}

function modifierCents(item: MenuItem, modifierIds: string[]): number {
  return modifierIds.reduce((sum, modifierId) => {
    const mod = item.modifiers?.find((entry) => entry.id === modifierId);
    return sum + (mod?.cents ?? 0);
  }, 0);
}

export function totals(cart: Cart): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = cart.lines.reduce((sum, line) => sum + line.lineCents, 0);
  const discountCents = Math.min(cart.promo?.cents ?? 0, subtotalCents);
  const taxable = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((taxable * TAX_BPS) / 10000);
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

export function addLine(
  state: ArcadeState,
  itemId: string,
  quantity: number,
  size?: Size,
  modifierIds: string[] = [],
  notes?: string,
): CartLine {
  const item = findItem(itemId, state.daypart) ?? MENU.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`"${itemId}" is not on this store's menu right now.`);
  if (item.daypart && !item.daypart.includes(state.daypart)) {
    throw new Error(`${item.name} is only served at ${item.daypart.join(" and ")}.`);
  }
  const qty = Math.max(1, Math.min(20, Math.floor(quantity || 1)));
  const modifiers = modifierIds.filter((modifierId) => item.modifiers?.some((mod) => mod.id === modifierId));
  const unitCents = itemPrice(item, size) + modifierCents(item, modifiers);
  const line: CartLine = {
    lineId: id("line"),
    itemId: item.id,
    name: item.name,
    quantity: qty,
    size,
    modifiers,
    unitCents,
    lineCents: unitCents * qty,
    notes,
  };
  state.cart.lines.push(line);
  state.pendingReview = undefined;
  return line;
}

export function applyPromo(state: ArcadeState, code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === "ARCADE10") {
    const { subtotalCents } = totals(state.cart);
    state.cart.promo = { code: normalized, cents: Math.round(subtotalCents * 0.1) };
    return "10% off food subtotal applied.";
  }
  if (normalized === "FRIESFRYDAY") {
    const fries = state.cart.lines.find((line) => line.itemId === "fries");
    if (!fries) throw new Error("Add fries before using FRIESFRYDAY.");
    state.cart.promo = { code: normalized, cents: Math.min(189, fries.lineCents) };
    return "Fries discount applied.";
  }
  throw new Error("That promo code is not valid at this store.");
}

export function reviewOrder(state: ArcadeState): OrderDraft {
  if (!state.cart.lines.length) throw new Error("Bag is empty.");
  if (!state.fulfillment) throw new Error("Choose pickup, drive-thru, or delivery first.");
  const money = totals(state.cart);
  state.pendingReview = {
    lines: structuredClone(state.cart.lines),
    fulfillment: state.fulfillment,
    ...money,
  };
  return state.pendingReview;
}

export function placeOrder(state: ArcadeState): Order {
  if (!state.pendingReview) throw new Error("Review the bag with the customer before placing the order.");
  const order: Order = {
    id: id("ord"),
    number: `A${Math.floor(100 + Math.random() * 899)}`,
    status: "received",
    fulfillment: state.pendingReview.fulfillment,
    lines: state.pendingReview.lines,
    subtotalCents: state.pendingReview.subtotalCents,
    taxCents: state.pendingReview.taxCents,
    discountCents: state.pendingReview.discountCents,
    totalCents: state.pendingReview.totalCents,
    createdAt: new Date().toISOString(),
    etaMinutes: state.pendingReview.fulfillment.method === "delivery" ? 28 : 7,
  };
  state.orders.unshift(order);
  state.cart = { lines: [] };
  state.pendingReview = undefined;
  return order;
}

export function summarizeCart(state: ArcadeState): string {
  if (!state.cart.lines.length) return "The bag is empty.";
  const money = totals(state.cart);
  const lines = state.cart.lines
    .map((line) => {
      const extras = [line.size, ...line.modifiers, line.notes].filter(Boolean).join(", ");
      return `- ${line.quantity}x ${line.name}${extras ? ` (${extras})` : ""} ${formatCents(line.lineCents)}`;
    })
    .join("\n");
  return [
    lines,
    state.cart.promo ? `Promo ${state.cart.promo.code}: -${formatCents(state.cart.promo.cents)}` : "",
    `Subtotal ${formatCents(money.subtotalCents)}`,
    `Tax ${formatCents(money.taxCents)}`,
    `Total ${formatCents(money.totalCents)}`,
    state.fulfillment ? `Fulfillment: ${state.fulfillment.method}` : "Fulfillment not set.",
  ].filter(Boolean).join("\n");
}

export function summarizeOrder(order: Order): string {
  return [
    `Order ${order.number} (${order.status})`,
    ...order.lines.map((line) => `${line.quantity}x ${line.name}`),
    `Total ${formatCents(order.totalCents)}`,
    `${order.fulfillment.method}, ETA ~${order.etaMinutes} min`,
  ].join("\n");
}
