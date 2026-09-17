import { defineWorkflow } from "../../core/workflow.ts";
import type { AgentTool } from "../../core/types.ts";
import type { WorkflowContext } from "../../core/workflow.ts";
import { id } from "../../core/ids.ts";

export interface ClinicState {
  clinic: { name: string; address: string };
  patient: { name?: string; phone?: string };
  appointments: Array<{ id: string; when: string; service: string; status: string }>;
  refills: Array<{ rx: string; medication: string; status: string }>;
  humanRequested?: boolean;
}

const SERVICES = [
  { id: "physical", name: "Annual physical", minutes: 40 },
  { id: "sick", name: "Same-day sick visit", minutes: 20 },
  { id: "vaccine", name: "Vaccination", minutes: 15 },
];

const SLOTS = ["Tomorrow 9:20 a.m.", "Tomorrow 2:40 p.m.", "Friday 11:10 a.m."];

function clinicTools(ctx: WorkflowContext<ClinicState>): AgentTool[] {
  const state = ctx.state;
  return [
    {
      name: "list_services",
      label: "List services",
      description: "List bookable clinic services.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: JSON.stringify(SERVICES, null, 2), details: SERVICES }),
    },
    {
      name: "find_slots",
      label: "Find slots",
      description: "Find open appointment slots.",
      parameters: {
        type: "object",
        properties: { serviceId: { type: "string" } },
      },
      execute: async () => ({ content: JSON.stringify(SLOTS, null, 2), details: { slots: SLOTS } }),
    },
    {
      name: "book_visit",
      label: "Book visit",
      description: "Book a visit into an open slot.",
      parameters: {
        type: "object",
        required: ["serviceId", "slot"],
        properties: {
          serviceId: { type: "string" },
          slot: { type: "string" },
          name: { type: "string" },
        },
      },
      execute: async (args) => {
        const service = SERVICES.find((entry) => entry.id === args.serviceId) ?? SERVICES[0];
        const appointment = {
          id: id("apt"),
          when: String(args.slot),
          service: service.name,
          status: "confirmed",
        };
        state.appointments.push(appointment);
        if (args.name) state.patient.name = String(args.name);
        ctx.save();
        return { content: JSON.stringify(appointment, null, 2), details: appointment };
      },
    },
    {
      name: "refill_prescription",
      label: "Refill prescription",
      description: "Start a refill for an existing demo Rx.",
      parameters: {
        type: "object",
        required: ["rx"],
        properties: { rx: { type: "string" }, medication: { type: "string" } },
      },
      pii: true,
      execute: async (args) => {
        const refill = {
          rx: String(args.rx),
          medication: String(args.medication ?? "as prescribed"),
          status: "sent-to-pharmacy",
        };
        state.refills.push(refill);
        ctx.save();
        return { content: JSON.stringify(refill, null, 2), details: refill };
      },
    },
    {
      name: "visit_status",
      label: "Visit status",
      description: "Return appointments and refills for this patient session.",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const details = { appointments: state.appointments, refills: state.refills };
        return { content: JSON.stringify(details, null, 2), details };
      },
    },
    {
      name: "request_human",
      label: "Request human",
      description: "Escalate to a nurse or receptionist.",
      parameters: {
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string" } },
      },
      execute: async (args) => {
        state.humanRequested = true;
        ctx.save();
        return { content: "Connecting you to the front desk.", details: { reason: args.reason }, terminate: true };
      },
    },
  ];
}

export const harborHealthWorkflow = defineWorkflow<ClinicState>({
  id: "harbor-health",
  name: "Harbor Health",
  description: "Clinic front-desk workflow: services, slots, booking, and prescription refill.",
  brand: {
    name: "Harbor Health",
    tagline: "Care, without the hold music.",
    tone: "Calm clinic receptionist. Clear next steps. No diagnosis.",
    disclaimer: "Demo clinic. Not a medical provider.",
    colors: {
      bg: "#07151c",
      panel: "#0f2430",
      primary: "#7ad1c4",
      accent: "#1f6f8b",
      text: "#eff8f6",
      muted: "#9fb9c3",
    },
  },
  suggestedPrompts: [
    "I need a same-day sick visit",
    "Book a physical tomorrow morning",
    "Refill Rx 44019",
  ],
  createState: () => ({
    clinic: { name: "Harbor Health Waterfront", address: "88 Basin St" },
    patient: {},
    appointments: [],
    refills: [],
  }),
  tools: clinicTools,
  publicState: (state) => ({
    clinic: state.clinic,
    patient: { name: state.patient.name ?? null },
    appointments: state.appointments,
    refills: state.refills.map((row) => ({ medication: row.medication, status: row.status })),
    humanRequested: Boolean(state.humanRequested),
  }),
  systemPrompt: (ctx) =>
    [
      "You are the Harbor Health front-desk assistant for patients.",
      "Do not diagnose. Do not invent appointment times. Use tools.",
      "Never ask for SSN or insurance ID in this demo.",
      `Known appointments: ${ctx.state.appointments.length}. Refills: ${ctx.state.refills.length}.`,
    ].join("\n"),
});
