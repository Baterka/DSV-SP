import WebSocket from 'ws';
import Http from "http";
import Express from 'express';
import bodyParser from 'body-parser';
import Debug from 'debug';
import Colors, {Color} from 'colors';
import {sleep, ip2int, nodeRootPage} from "./helpers";
import {parse} from "ts-node";

const colors: any = Colors;

colors.setTheme({
    info: 'green',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
});

/**
 * Identification of Node
 */
export class NodeId {
    ipAddress: string;
    port: number;
    size: number;

    constructor(ipAddress: string, port: number) {
        this.ipAddress = ipAddress;
        this.port = port;

        this.size = parseInt('' + ip2int(ipAddress) + port);
    }

    toString(): string {
        return this.ipAddress + ':' + this.port;
    }

    toJSON(): {} {
        return {
            ipAddress: this.ipAddress,
            port: this.port,
        }
    }

    toNumber() {
        return this.size;
    }

    /**
     * Deserialize from JSON into class
     */
    static fromJSON(json: { ipAddress: string, port: number }): NodeId {
        return new NodeId(json.ipAddress, json.port);
    }

    /**
     * Deserialize from string into class
     */
    static fromString(string: string): NodeId {
        const split = string.split(':');
        return new NodeId(split[0], parseInt(split[1]));
    }
}

export class SocketReference {
    id: number;
    socket: WebSocket;

    constructor(socket: WebSocket, id: number = -1) {
        this.socket = socket;
        this.id = id;
    }
}

/**
 * Reference to Node and WebSocket tunnel between
 */
export class NodeReference {
    id: NodeId;
    slave: boolean;
    socket: SocketReference | undefined;

    constructor(id: NodeId, slave: boolean = false, socket?: SocketReference) {
        this.id = id;
        this.slave = slave;
        this.socket = socket;
    }

    toString(): string {
        return `${this.id} ${this.socket ? 'CONNECTED' : 'DISCONNECTED'}`;
    }
}

/**
 * Message transferred between Nodes over WebSocket
 */
export class Message {
    action: string;
    payload: any;

    constructor(action: string = '', payload: {} = {}) {
        this.action = action;
        this.payload = payload;
    }

    toJSON(): {} {
        return {
            action: this.action,
            payload: this.payload
        }
    }

    static makeMessage(string: string): Message {
        try {
            const msg: { action: string, payload: {} } = JSON.parse(string);
            if (msg.action && msg.payload)
                return new Message(msg.action, msg.payload);
            return new Message();
        } catch (err) {
            return new Message();
        }
    }
}

export class Node {
    id: NodeId;

    //leftNode: NodeReference;
    rightNode: NodeReference;
    masterNode: NodeReference | undefined;

    leader: boolean;
    watchingLeader: boolean;

    slaveNodes: NodeReference[];

    electionParticipant: boolean;

    circleHealthy: boolean;

    log: Function;
    Log: Debug.Debugger;

    httpServer: Http.Server | undefined;
    expressApp: Express.Application | undefined;
    wsServer: WebSocket.Server | undefined;

    sharedVariable: any;
    sharedVariableTimeout: number | undefined;
    sharedVariableResolve: Function | undefined;

    signedIn: boolean;

    nextDisconnectIsNotFail: boolean;

    constructor(/*leftNodeId: NodeId, */rightNodeId: NodeId, nodeId: NodeId = new NodeId('127.0.0.1', 3000), isLeader = false) {
        this.id = nodeId;

        //this.leftNode = new NodeReference(leftNodeId);
        this.rightNode = new NodeReference(rightNodeId);

        this.leader = isLeader;
        this.watchingLeader = false;

        this.electionParticipant = false;

        this.slaveNodes = [];

        this.circleHealthy = false;

        this.Log = Debug(this.toString());
        this.log = (msg: string) => this.Log(`[${new Date().toISOString()}] ${msg}`);

        this.signedIn = true;

        this.nextDisconnectIsNotFail = false;

        this.startServer();
    }

    private startServer() {

        this.expressApp = Express();
        // Create HTTP server
        this.httpServer = Http.createServer(this.expressApp);

        this.setExpressRoutes(this.expressApp);

        // Create WS server
        this.wsServer = new WebSocket.Server({
            server: this.httpServer
        });

        // Listen for connections
        this.wsServer.on('connection', this.onConnection.bind(this));

        // Start HTTP server
        this.httpServer.listen(this.id.port, this.id.ipAddress, () => {
            this.log(
                `HTTP server listening on port ${this.id.port}`
            );
        });

        this.connectToNode(this.rightNode);
    }

    private setExpressRoutes(app: Express.Application): void {
        app.use(bodyParser.json());

        // Information about node (for debugging purposes)
        app.get('/', (req: Express.Request, res: Express.Response) => {
            res.send(nodeRootPage(this));
        });

        // Get shared variable
        app.get('/variable', (req: Express.Request, res: Express.Response) => {
            if (this.sharedVariable)
                res.json({
                    success: true,
                    variable: this.sharedVariable
                });
            else
                res.status(404).json({
                    success: false,
                    error: 'Not set'
                });
        });

        // Set shared variable
        app.post('/variable/set', async (req: Express.Request, res: Express.Response) => {

            let success = true;
            let error = undefined;
            const variable = req.body.variable;

            if (!this.leader)
                return res.json({
                    success: false,
                    error: 'Not leader'
                });

            if (!this.circleHealthy)
                return res.json({
                    success: false,
                    error: 'Not healthy'
                });

            if (!variable)
                return res.json({
                    success: false,
                    error: 'Invalid input'
                });

            if (!await this.setSharedVariable(variable))
                return res.json({
                    success: false,
                    error: 'Propagation failed after 3 tries'
                });

            res.json({
                success: true
            });
        });

        // Sign-out from circle
        app.get('/signout', (req: Express.Request, res: Express.Response) => {
            if (!this.rightNode.socket || !this.signedIn)
                return res.json({
                    success: false,
                    error: 'Already signed-out'
                });

            this.leader = false;
            this.signedIn = false;
            this.watchingLeader = false;

            if (this.wsServer)
                for (const client of Array.from(this.wsServer.clients))
                    client.close();
            this.rightNode.socket.socket.close();
            this.rightNode.socket = undefined;

            return res.json({
                success: true
            });
        });

        // Sign-in to circle
        // Sign-out from circle
        app.get('/signin', (req: Express.Request, res: Express.Response) => {
            if (this.rightNode.socket || this.signedIn)
                return res.json({
                    success: false,
                    error: 'Already signed-in'
                });

            this.signedIn = true;

            this.connectToNode(this.rightNode, true);

            return res.json({
                success: true,
            });
        });
    }

    private async setSharedVariable(variable: any, tries: number = 0): Promise<any> {
        if (tries < 3) {
            this.sendVariable(variable);
            const wait = () => new Promise(resolve => {
                this.sharedVariableResolve = resolve;
                this.sharedVariableTimeout = setTimeout(this.sharedVariableResolve, 3000);
            });
            await wait();

            if (this.sharedVariable !== variable)
                this.setSharedVariable(variable, tries++);

            return true;
        } else
            return false;
    }

    private sendVariable(variable: any) {
        Node.sendMessage(this.rightNode, new Message('VARIABLE', {
            forId: this.getId(),
            fromId: this.getId(),
            variable
        }));
        this.log(`Sent VARIABLE to: ${this.rightNode.id}`);
    }

    private signIn() {

    }

    private signOut() {

    }

    private onConnection(socket: WebSocket, req: Http.IncomingMessage) {
        const self = this;

        socket.on('message', (msg: string) => this.onMessageServer(socket, msg));

        socket.on('close', function () {
            self.log(`Lost connection from some node!`);
            try {
                if (!self.nextDisconnectIsNotFail)
                    self.reportNodeFailure();
                else
                    self.nextDisconnectIsNotFail = false;
            } catch (err) {
                // Ignore (rightNode is not yet connected)
            }
        });
    }

    private onMessageServer(socket: WebSocket, rawMsg: string) {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(
                `Received unknown message from client: ${rawMsg}`
            );

        const payload: any = msg.payload;

        // Discard every incoming message if not signed-in
        if (!this.signedIn)
            return this.log(`Discarded ${msg.action} from: ${payload.fromId} (SIGNED-OUT)`);

        switch (msg.action) {
            case 'HELLO':
                // Set reference to left node
                //this.leftNode = new NodeReference(payload.id, socket);

                this.log(`Received HELLO from: ${payload.fromId}`);

                // Leader can start first HEALTH check
                if (this.leader)
                    this.initHealthCheck();

                // Check if this node should watch leader
                if (payload.watchMe) {
                    this.log(`I AM WATCHING LEADER!`);
                    this.watchingLeader = true;
                }

                // My old ancestor reconnected (re-signed-in)
                if (payload.reconnect) {
                    if (this.leader)
                        this.setHealthCorrupted();

                    Node.sendMessage(this.rightNode, new Message('RECONNECT', {
                        fromId: this.getId(),
                        originNodeId: this.getId(),

                        // Who reconnected
                        reconnectedNode: NodeId.fromString(payload.fromId),
                    }));

                    this.log(`Sent RECONNECT to: ${this.rightNode.id}`);
                }

                break;
            case 'HEALTHY':
                this.log(`Received HEALTHY from: ${payload.fromId}`);

                // If leader received back my HEALTH check
                if (payload.forId === this.getId()) {
                    this.circleHealthy = true;
                    this.log(colors.info(`CIRCLE IS HEALTHY!`));

                    // Let all other nodes report to this leader node
                    Node.sendMessage(this.rightNode, new Message('REPORT', {
                        fromId: this.getId(),
                        forId: this.getId(),
                        slaves: []
                    }));
                } else
                    this.forwardMessage(msg);
                break;
            case 'REPORT':
                this.log(`Received REPORT from: ${payload.fromId}`);

                // If leader received back my REPORT message
                if (payload.forId === this.getId()) {
                    this.log(colors.info(`EVERYONE REPORTED TO ME!`));
                    this.connectToSlaves(payload.slaves);
                } else {
                    msg.payload.slaves.push(this.id);
                    this.forwardMessage(msg);
                }
                break;
            case 'FAIL':
                this.log(`Received FAIL from: ${payload.fromId} ${JSON.stringify(payload)}`);

                const originNodeId: NodeId = NodeId.fromJSON(payload.originNode);

                // If this node is leader, uncheck healthy state
                if (this.leader)
                    this.setHealthCorrupted();

                // Disconnect right node manually, if this is reconnect (fake fail)
                if (payload.reconnect && this.rightNode.socket) {
                    Node.sendMessage(this.rightNode, new Message('LEAVING', {
                        fromId: this.getId()
                    }));
                    this.log(`Sent LEAVING to: ${this.rightNode.id}`);
                    this.rightNode.socket.socket.close();
                    this.rightNode.socket = undefined;
                }

                // If node without connected rightNode received FAIL message
                if (!this.rightNode.socket) {
                    // Reconfigure rightNode
                    this.rightNode = new NodeReference(originNodeId);

                    this.log(`Reconfigured rightNode to: ${originNodeId}`);

                    // Connect to newly configured node
                    this.connectToNode(this.rightNode);
                } else
                    this.forwardMessage(msg);
                break;
            case 'ELECTION':
                this.log(`Received ELECTION from: ${payload.fromId}`);

                const toBeElectedNodeId: NodeId = NodeId.fromJSON(payload.toBeElectedId);

                // If toBeElected is larger than this, forward
                if (toBeElectedNodeId.toNumber() > this.id.toNumber()) {
                    this.log(`Election message is larger.`);
                    this.forwardMessage(msg);
                }

                // If toBeElected is smalled than this
                else if (toBeElectedNodeId.toNumber() < this.id.toNumber() && !this.electionParticipant) {
                    this.log(`Election message is smaller and I am not participant, yet. Mark me as to be elected.`);
                    this.electionParticipant = true;
                    msg.payload.toBeElectedId = this.id;
                    this.forwardMessage(msg);
                }

                // If toBeElected is equals to this, set myself as leader and inform others
                else if (toBeElectedNodeId.toNumber() === this.id.toNumber()) {
                    this.log(colors.info(`I WAS ELECTED AS LEADER!`));
                    this.leader = true;
                    this.electionParticipant = false;

                    try {
                        Node.sendMessage(this.rightNode, new Message('ELECTED', {
                            newLeaderId: this.getId(),
                            watchMe: true,
                            fromId: this.getId()
                        }));
                        this.log(`Sent ELECTED to: ${this.rightNode.id}`);

                        this.initHealthCheck();
                    } catch (err) {
                        // Ignore (rightNode is not yet connected)
                    }
                }
                break;
            case 'ELECTED':
                this.log(`Received ELECTED from: ${payload.fromId}`);

                // If this is my message about election, discard
                if (payload.newLeaderId === this.getId())
                    return;

                // If this node should watch leader
                if (payload.watchMe) {
                    this.watchingLeader = true;
                    payload.watchMe = false;
                }

                this.electionParticipant = false;
                this.forwardMessage(msg);
                break;
            case 'VARIABLE':
                this.log(`Received VARIABLE from: ${payload.fromId}`);

                this.sharedVariable = payload.variable;

                // If this is my message, discard
                if (payload.forId === this.getId()) {
                    if (this.sharedVariableResolve && this.sharedVariableTimeout) {
                        this.sharedVariableResolve();
                        clearTimeout(this.sharedVariableTimeout);
                    }
                    return;
                }

                this.forwardMessage(msg);
                break;
            case 'RECONNECT':
                this.log(`Received RECONNECT from: ${payload.fromId} ${JSON.stringify(payload)}`);

                const reconnectedNodeId: NodeId = NodeId.fromJSON(payload.reconnectedNode);

                // If this node is leader, uncheck healthy state
                if (this.leader)
                    this.setHealthCorrupted();

                // If this message came from my right neighbor
                if (payload.originNodeId === this.rightNode.id.toString()) {
                    // Disconnect right node manually
                    if (this.rightNode.socket) {
                        Node.sendMessage(this.rightNode, new Message('LEAVING', {
                            fromId: this.getId()
                        }));
                        this.log(`Sent LEAVING to: ${this.rightNode.id}`);
                        this.rightNode.socket.socket.close();
                        this.rightNode.socket = undefined;
                    }

                    // Reconfigure rightNode
                    this.rightNode = new NodeReference(reconnectedNodeId);

                    this.log(`Reconfigured rightNode to: ${reconnectedNodeId}`);

                    // Connect to newly configured node
                    this.connectToNode(this.rightNode);
                } else
                    this.forwardMessage(msg);
                break;
            case 'LEAVING':
                this.log(`Received LEAVING from: ${payload.fromId}`);
                this.nextDisconnectIsNotFail = true;
                break;
        }
    }

    private setHealthCorrupted() {
        this.circleHealthy = false;
        this.slaveNodes = [];
        this.log(colors.warn(`HEALTH OF CIRCLE IS CORRUPTED!`));

        // Start health re-check
        this.initHealthCheck();
    }

    private findSlaveIndex(id: NodeId): number {
        for (let i = 0; i < this.slaveNodes.length; i++) {
            if (this.slaveNodes[i].id == id)
                return i;
        }

        return -1;
    }

    private async forwardMessage(msg: Message) {
        await sleep(200);
        try {
            // Overwrite fromId in message
            msg.payload.fromId = this.getId();

            Node.sendMessage(this.rightNode, msg);
            this.log(`Forwarded ${msg.action} to: ${this.rightNode.id}`);
        } catch (err) {
            this.log(`Failed to forward message to: ${this.rightNode.id}`);
        }
    }

    private connectToSlaves(slaves: { ipAddress: string, port: number } []) {

        // Not implemented, yet
        return;

        for (let slaveJSON of slaves) {
            const slave: NodeReference = new NodeReference(NodeId.fromJSON(slaveJSON), true);
            this.slaveNodes.push(slave);
            this.connectToNode(slave);
        }
    }

    private async initHealthCheck() {
        if (this.circleHealthy)
            return;

        try {
            this.sendHealthCheck();
        } catch (err) {
            // Ignore (rightNode is not yet connected)
        }

        // Healthy check message timeout
        await sleep(2000);

        // If HEALTHY message not received, send new
        if (!this.circleHealthy)
            this.initHealthCheck();
    }

    private async initLeaderElection() {
        await sleep(3000);
        try {
            this.electionParticipant = true;
            Node.sendMessage(this.rightNode, new Message('ELECTION', {
                toBeElectedId: this.id,
                fromId: this.getId()
            }));
            this.log(`Sent ELECTION to: ${this.rightNode.id}`);
        } catch (err) {
            // Ignore (rightNode is not yet connected)
        }

        // Election message timeout
        await sleep(2000);

        // If ELECTION or ELECTED message not received, send new
        if (this.electionParticipant)
            this.initLeaderElection();
    }

    private sendHealthCheck() {
        Node.sendMessage(this.rightNode, new Message('HEALTHY', {
            forId: this.getId(),
            fromId: this.getId()
        }));
        this.log(`Sent HEALTHY to: ${this.rightNode.id}`);
    }

    private connectToNode(node: NodeReference, reconnect: boolean = false) {
        // Do nothing when connection already exists
        if (node.socket)
            return;

        // Create new connection
        const ws = new WebSocket(`ws://${node.id}`);

        ws.on('open', () => {
            node.socket = new SocketReference(ws);
            Node.sendMessage(node, new Message('HELLO', {
                fromId: this.getId(),
                watchMe: this.leader,
                reconnect
            }));

            // No need for Server->Client messages, yet
            //ws.on('message', (rawMsg: string) => this.onMessageClient(ws, rawMsg));
        });

        ws.on('error', async err => {
            node.socket = undefined;
            this.log(`Error connecting to: ${node.id}`);
            await sleep(1000);
            this.connectToNode(node);
        });

        ws.on('close', async () => {
            node.socket = undefined;
            //this.log(`Lost connection to: ${node.id}`);
        });
    }

    private reportNodeFailure() {

        if (this.leader)
            this.setHealthCorrupted();

        Node.sendMessage(this.rightNode, new Message('FAIL', {
            fromId: this.getId(),

            // Who reported fail
            originNode: this.id,

            // Who died
            //failedNode: this.leftNode.id
        }));

        this.log(`Sent FAIL to: ${this.rightNode.id}`);

        // If this node was watching leader (what just crashed), start election
        if (this.watchingLeader) {
            this.initLeaderElection();
            this.log("LEADER ELECTION STARTED!");
        }
    }

    private onMessageClient(socket: WebSocket, rawMsg: string) {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(`Received unknown message from server: ${rawMsg}`);

        const payload: any = msg.payload;

        switch (msg.action) {
            default:
                this.log(`Received unknown message from server.`);
                break;
        }
    }

    private static sendMessage(node: NodeReference, msg: Message) {
        if (node.socket)
            return node.socket.socket.send(JSON.stringify(msg));
        else
            throw new Error(`rightNode's socket reference does not exists.`);
    }

    getId() {
        return this.id.toString();
    }

    toString() {
        return `Node ${this.getId()}`;
    }
}