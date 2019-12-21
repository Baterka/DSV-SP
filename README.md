# DSV-Semestralka
Semestral project for the subject **[B6B32DSV](https://www.fel.cvut.cz/en/education/bk/predmety/31/31/p3131406.html)** on **[FEE CTU](https://www.fel.cvut.cz/)** in winter semester 2019.

# Task
**Shared variable**
- Implement a program to access the shared variable..
- Realize access using either a 'leader' or exclusive system-wide access.
- Individual nodes will implement at least these functions:
  - read / write variable
  - log off the system
  - exit without logging out
  - log in to the system

*(Translated from Czech original)*

# Implementation
## Overview
- **Written in:** [TypeScript](https://www.typescriptlang.org/) (transpiled into JavaScript)
- **Runtime Environment:** [Node.js](https://nodejs.org/en/)
-  **Libraries used:**
   - [ws](https://www.npmjs.com/package/ws) - WebSocket server (and client)
   - [express](https://www.npmjs.com/package/express) - minimalist web server
   - [axios](https://www.npmjs.com/package/axios) - HTTP client
   - [debug](https://www.npmjs.com/package/debug) - debugging utility
   - and more... *(Check [package.json](https://github.com/Baterka/DSV-Semestralka/blob/master/package.json))*
  - **Algorithm:** [Chang and Roberts](https://en.wikipedia.org/wiki/Chang_and_Roberts_algorithm) - ring-based coordinator election algorithm
## [Topology description](https://github.com/Baterka/DSV-Semestralka/wiki/Topology-description)
## [API Reference](https://github.com/Baterka/DSV-Semestralka/wiki/API-Reference)

# Installation
1) Clone repository
2) `cd DSV-Semestralka/`
3) `npm install -g yarn` and `yarn install` *(or just use `npm install` without installing `yarn`)*
- To build app into native JavaScript run `npm run build`
- To fork (start/spawn) Node run:
	-  `npm start` - Native JavaScript
	- `npm run debug` - TypeScript by `ts-node`
- To deploy Nodes to different machines:
	- Edit `servers`,`username`,`password` variables in [`deploy.js`](https://github.com/Baterka/DSV-Semestralka/blob/master/deploy.js) file
	- Run `npm run deploy -- <tip>` *(\<tip> is template IP address)*
