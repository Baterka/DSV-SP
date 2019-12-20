# DSV-Semestralka
Semestrální projekt pro předmět **B6B32DSV** na **FEL ČVUT** v zimním semestru 2019.

## Task
**Shared variable**
- Implement a program to access the shared variable..
- Realize access using either a 'leader' or exclusive system-wide access.
- Individual nodes will implement at least these functions:
  - read / write variable
  - log off the system
  - exit without logging out
  - log in to the system

*(Translated from Czech original)*

## Implementation
### Overview
- **Written in:** [TypeScript](https://www.typescriptlang.org/) (transpiled into JavaScript)
- **Runtime Environment:** [Node.js](https://nodejs.org/en/)
-  **Libraries used:**
   - [ws](https://www.npmjs.com/package/ws) - WebSocket server (and client)
   - [express](https://www.npmjs.com/package/express) - minimalist web server
   - [axios](https://www.npmjs.com/package/axios) - HTTP client
   - [debug](https://www.npmjs.com/package/debug) - debugging utility
   - and more... *(Check [package.json](https://github.com/Baterka/DSV-Semestralka/blob/master/package.json))*
  - **Algorithm:** [Chang and Roberts](https://en.wikipedia.org/wiki/Chang_and_Roberts_algorithm) - ring-based coordinator election algorithm
### Topology description
[TODO]
### Classes description
[TODO]
### Node's API
*All endpoints require and respond with media type `application/json`.*

#### **GET /** - Overview *(All main information about Node)*
Request:
```javascript
<empty>
```
 Response:
```javascript
{
	node: string<NodeId>,
	rightNode: string<NodeId>,
	variable: any
	signedIn: boolean,
	leader: boolean,
	circleHealthy: boolean,
	slaves: string<NodeId>[]
}
```
	
**GET /variable** - Get variable saved in Node
Request:
```javascript
<empty>
```
 Response:
```javascript
{
	success: boolean,
	error?: string,
	variable?: any
}
```
 
**POST /variable** - Set variable into Node
Request:
```javascript
{
	variable: any,
	fromId?: string(NodeId)
}
```
 Response:
```javascript
{
	success: boolean,
	error?: string,
	variable?: any
}
```

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
