import { defineWorkflow } from "../../core/workflow.ts";
import { availableMenu, formatCents, STORE } from "./catalog.ts";
import { createArcadeState, summarizeCart, type ArcadeState } from "./store.ts";
import { arcadeTools } from "./tools.ts";

export const arcadeBurgersWorkflow = defineWorkflow<ArcadeState>({
  id: "arcade-burgers",
  name: "Arcade Burgers",
  description: "McDonald’s-class QSR guest ordering: browse, customize, bag, tax, checkout, and status.",
  brand: {
    name: "Arcade Burgers",
    tagline: "Order at the counter — from anywhere.",
    tone: "Fast, friendly drive-thru cashier. Short sentences. Never upsell twice.",
    disclaimer: "Demo brand. Not affiliated with McDonald’s or any restaurant chain.",
    colors: {
      bg: "#140b0a",
      panel: "#231312",
      primary: "#ffc300",
      accent: "#da291c",
      text: "#fff8ee",
      muted: "#d7b7a5",
    },
  },
  suggestedPrompts: [
    "What's on the menu?",
    "I want an Arcade Burger meal, large, with a Coke, pickup",
    "Two cheeseburgers, no pickles, and a small fries",
    "Where's my order?",
  ],
  policy: {
    sensitiveTools: ["place_order", "cancel_order"],
    piiTools: ["set_customer_profile"],
    maxTurns: 10,
  },
  createState: () => createArcadeState("lunch"),
  tools: arcadeTools,
  publicState: (state) => ({
    store: state.store,
    daypart: state.daypart,
    cart: state.cart,
    totals: state.cart.lines.length
      ? {
          summary: summarizeCart(state),
        }
      : { summary: "The bag is empty." },
    fulfillment: state.fulfillment ?? null,
    customer: {
      name: state.customer.name ?? null,
      hasPhone: Boolean(state.customer.phone),
      hasEmail: Boolean(state.customer.email),
    },
    pendingReview: state.pendingReview ?? null,
    orders: state.orders.map((order) => ({
      number: order.number,
      status: order.status,
      total: formatCents(order.totalCents),
      method: order.fulfillment.method,
      etaMinutes: order.etaMinutes,
    })),
    humanRequested: Boolean(state.humanRequested),
  }),
  systemPrompt: (ctx) => {
    const featured = availableMenu(ctx.state.daypart)
      .filter((item) => ["arcade-burger", "golden-stack", "fries", "arcade-meal"].includes(item.id))
      .map((item) => `${item.name} ${formatCents(item.cents)}`)
      .join(", ");
    return [
      `You are the guest ordering assistant for ${STORE.name} at ${STORE.address}.`,
      "This is a customer-facing production workflow, not a coding agent.",
      "You speak like a sharp drive-thru cashier: warm, brief, and accurate.",
      "Never invent menu items, sizes, modifiers, or prices. Tools are the source of truth.",
      "Never run shell, filesystem, or payment-card tools. You only have the ordering tools.",
      "Never collect CVV, full card numbers, or SSN. Tender is a mock token already on file.",
      "If the customer asks for something not on the menu, say so and offer the closest catalog item.",
      "Allergens: you can remove listed modifiers. For medical allergy questions, call request_human.",
      `Current daypart: ${ctx.state.daypart}. ${STORE.hours}. Featured: ${featured}.`,
      "Flow: understand order → search_menu/get_item → add_to_cart → set_fulfillment → review_order → wait for confirmation → place_order.",
      "After review_order, summarize totals and ask them to confirm. Only then call place_order.",
      "If they say that's all / checkout / pay, review before placing.",
      `Bag right now:\n${summarizeCart(ctx.state)}`,
    ].join("\n");
  },
});
