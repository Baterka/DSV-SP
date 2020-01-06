# DSV-SP
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
- Log into both the console and the file.
  - Logs will be stamped with a logical timestamp.
- Each node will have a unique identification.
  - A combination of IP address and port is recommended.

*(Translated from Czech original)*

# Implementation
## Overview
- **Written in:** [TypeScript](https://www.typescriptlang.org/) (transpiled into JavaScript)
- **Runtime Environment:** [Node.js](https://nodejs.org/en/)
-  **Libraries used:**
   - [ws](https://www.npmjs.com/package/ws) - WebSocket server (and client)
   - [express](https://www.npmjs.com/package/express) - minimalist web server
   - [axios](https://www.npmjs.com/package/axios) - HTTP client
   - [log4js](https://www.npmjs.com/package/log4js) - debugging utility
   - and more... *(Check [package.json](https://github.com/Baterka/DSV-Semestralka/blob/master/package.json))*
  - **Algorithm:** [Chang and Roberts](https://en.wikipedia.org/wiki/Chang_and_Roberts_algorithm) - ring-based coordinator election algorithm
## [Topology description](https://github.com/Baterka/DSV-Semestralka/wiki/Topology-description)
## [API Reference](https://github.com/Baterka/DSV-Semestralka/wiki/API-Reference)
## [Tests](https://github.com/Baterka/DSV-Semestralka/wiki/Tests)

# Installation
1) Clone repository
2) `cd DSV-Semestralka/`
3) `npm install -g yarn` and `yarn install` *(or just use `npm install` without installing `yarn`)*
- To build app into native JavaScript run `yarn run build`
- To fork (start/spawn) Node run:
	- `yarn start -- <ARGUMENTS>` - Native JavaScript [(usage)](https://github.com/Baterka/DSV-SP/wiki)
	- `yarn run debug -- <ARGUMENTS>` - TypeScript by `ts-node` [(usage)](https://github.com/Baterka/DSV-SP/wiki)
- To deploy Nodes to different machines:
	- Edit `servers`,`username`,`password` variables in [`deploy.js`](https://github.com/Baterka/DSV-Semestralka/blob/master/deploy.js) file
	- Run `yarn run deploy -- <tip>` *(\<tip> is template IP address)*
	
*(You can always use `npm` instead of `yarn`)*
