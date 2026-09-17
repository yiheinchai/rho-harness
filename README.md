# Rho

Rho is a **customer workflow harness**: a production fork of the [Pi](https://github.com/earendil-works/pi) / [OpenCode](https://github.com/anomalyco/opencode) agent model, rebuilt so enterprises can run **guest-facing** journeys instead of coding agents.

Pi and OpenCode wrap a model in an agent loop, tools, streaming events, and before/after tool hooks — then they hand the model a filesystem and a shell. Rho keeps the harness and **replaces the coding tools with workflow tools**. The same loop that would have edited a repo can take a McDonald’s-class drive-thru order, book a clinic visit, or run any other catalog-backed customer conversation.

This repository is a **domain fork**, not a git clone of those codebases. Architecture, event names, tool hooks, and sequential/parallel execution follow Pi’s `pi-agent-core`. The product is a guest lane.

> Arcade Burgers is a fictional QSR used to prove a McDonald’s-style ordering chat. It is not affiliated with McDonald’s Corporation.

## Quick start

```bash
npm install
npm test
npm start
```

Open http://127.0.0.1:8787 and complete an Arcade Burgers order as a customer, or run `npm run demo`.
