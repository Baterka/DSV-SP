import WebSocket from 'ws';
import Http from 'http';
import Debug from 'debug';
import {sleep, ip2int} from "./helpers";

export class NodeReference {
    id: NodeId;
    socket: WebSocket | undefined;

    constructor(id: NodeId, socket?: WebSocket) {
        this.id = id;
        this.socket = socket;
    }

    toString(): string {
        return `${this.id} ${this.socket ? 'CONNECTED' : 'DISCONNECTED'}`;
    }
}

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
}

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

    leftNode: NodeReference;
    rightNode: NodeReference;

    leader: boolean;
    watchingLeader: boolean;

    slaveNodes: NodeReference[];

    electionParticipant: boolean;

    circleHealthy: boolean;

    log: Debug.Debugger;

    httpServer: Http.Server | undefined;
    wsServer: WebSocket.Server | undefined;

    constructor(leftNodeId: NodeId, rightNodeId: NodeId, nodeId: NodeId = new NodeId('127.0.0.1', 3000), isLeader = false) {
        this.id = nodeId;

        this.leftNode = new NodeReference(leftNodeId);
        this.rightNode = new NodeReference(rightNodeId);

        this.leader = isLeader;
        this.watchingLeader = false;

        this.electionParticipant = false;

        this.slaveNodes = [];

        this.circleHealthy = false;

        this.log = Debug(this.toString());

        this.startServer();
    }

    private startServer() {

        // Create HTTP server
        this.httpServer = Http.createServer((req, res) => {
                res.writeHead(200);

                // Information about node (for debugging purposes)
                let slaveList: string = '';
                let first: boolean = true;
                for (let slave of this.slaveNodes) {
                    slaveList += `
                        <tr>
                            <td><b>${first ? 'Slaves:' : ''}</b></td>
                            <td>${slave}</td>
                        </tr>
                    `;
                    first = false;
                }
                res.write(`
                <html>
                    <table>
                        <thead>
                            <tr>
                                <td><b>Node:</b></td>
                                <td>${this.getId()}</td>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>leftNode:</b></td>
                                <td>${this.leftNode}</td>
                            </tr>
                            <tr>
                                <td><b>rightNode:</b></td>
                                <td>${this.rightNode}</td>
                            </tr>
                            <tr>
                                <td><b>Leader:</b></td>
                                <td>${this.leader ? 'Yes' : 'No'}</td>
                            </tr>
                        </tbody>
                    </table><br>
                    ${this.leader ? `
                    <table>
                        <tbody>
                            <tr>
                                <td><b>Circle healthy:</b></td>
                                <td>${this.circleHealthy ? `Yes` : `No`}</td>
                            </tr>
                            ${slaveList}
                        </tbody>
                    </table>
                    ` : ``}
                </html>
            `);
                res.end();
            }
        );

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

    private onConnection(socket: WebSocket, req: Http.IncomingMessage) {
        socket.on('message', (msg: string) => this.onMessageServer(socket, msg));

        socket.on('close', () => {
            this.log(`Lost connection from: ${this.leftNode.id}`);
            this.reportNodeFailure();
        });
    }

    private onMessageServer(socket: WebSocket, rawMsg: string) {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(
                `Received unknown message from client: ${rawMsg}`
            );

        const payload: any = msg.payload;

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

                break;
            case 'HEALTHY':
                this.log(`Received HEALTHY from: ${payload.fromId}`);

                // If leader received back my HEALTH check
                if (payload.forId === this.getId()) {
                    this.circleHealthy = true;
                    this.log("CIRCLE IS HEALTHY!");

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
                    this.connectToSlaves(payload.slaves);
                } else {
                    msg.payload.slaves.push(this.id);
                    this.forwardMessage(msg);
                }
                break;
            case 'FAIL':
                this.log(`Received FAIL from: ${payload.fromId}`);

                const originNodeId: NodeId = NodeId.fromJSON(payload.originNode);

                // If this node is leader, uncheck healthy state
                if (this.leader)
                    this.setHealthCorrupted();

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
                if (toBeElectedNodeId.toNumber() > this.id.toNumber())
                    this.forwardMessage(msg);

                // If toBeElected is smalled than this
                else if (toBeElectedNodeId.toNumber() < this.id.toNumber() && !this.electionParticipant) {
                    msg.payload.toBeElectedId = this.id;
                    this.forwardMessage(msg);
                }

                // If toBeElected is equals to this, set myself as leader and inform others
                else if (toBeElectedNodeId.toNumber() === this.id.toNumber()) {
                    this.leader = true;
                    this.electionParticipant = false;
                    Node.sendMessage(this.rightNode, new Message('ELECTED', {
                        newLeaderId: this.getId(),
                        fromId: this.getId()
                    }));
                    this.log(`Sent ELECTED to: ${this.rightNode.id}`);
                }
                break;
            case 'ELECTED':
                this.log(`Received ELECTED from: ${payload.fromId}`);

                // If my message about election, discard
                if (payload.forId != this.getId())
                    return;

                this.electionParticipant = false;
                this.forwardMessage(msg);
                break;
        }
    }

    private setHealthCorrupted() {
        this.circleHealthy = false;
        this.slaveNodes = [];
        this.log(`HEALTH OF CIRCLE IS CORRUPTED!`);

        this.initHealthCheck();
    }

    private findSlaveIndex(id: NodeId): number {
        for (let i = 0; i < this.slaveNodes.length; i++) {
            if (this.slaveNodes[i].id == id)
                return i;
        }

        return -1;
    }

    private forwardMessage(msg: Message) {
        try {
            // Overwrite fromId in message
            msg.payload.fromId = this.getId();

            Node.sendMessage(this.rightNode, msg);
            this.log(`Forwarded ${msg.action} to: ${this.rightNode.id}`);
        } catch (err) {
            // Ignore (rightNode is not yet connected)
        }
    }

    private connectToSlaves(slaves: { ipAddress: string, port: number } []) {
        for (let slaveJSON of slaves) {
            const slave: NodeReference = new NodeReference(NodeId.fromJSON(slaveJSON));
            this.slaveNodes.push(slave);
            this.connectToNode(slave);
        }
        this.log("EVERYONE REPORTED TO ME!");
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
        try {
            Node.sendMessage(this.rightNode, new Message('ELECTION', {
                toBeElectedId: this.getId(),
                fromId: this.getId()
            }));
            this.log(`Sent ELECTION to: ${this.rightNode.id}`);
        } catch (err) {
            // Ignore (rightNode is not yet connected)
        }

        // Election message timeout
        await sleep(2000);

        // If ELECTION message not received, send new
        if (!this.leader)
            this.initLeaderElection();
    }

    private sendHealthCheck() {
        Node.sendMessage(this.rightNode, new Message('HEALTHY', {
            forId: this.getId(),
            fromId: this.getId()
        }));
        this.log(`Sent HEALTHY to: ${this.rightNode.id}`);
    }

    getId() {
        return this.id.toString();
    }

    toString() {
        return `Node ${this.getId()}`;
    }

    private connectToNode(node: NodeReference) {
        // Do nothing when connection already exists
        if (node.socket)
            return;

        // Create new connection
        const ws = new WebSocket(`ws://${node.id}`);

        ws.on('open', () => {
            node.socket = ws;
            Node.sendMessage(node, new Message('HELLO', {
                fromId: this.getId(),
                watchMe: this.leader
            }));

            // No need for Server->Client messages, yet
            //ws.on('message', (rawMsg: string) => this.onMessageClient(ws, rawMsg));
        });

        ws.on('error', err => {
            node.socket = undefined;
            this.connectToNode(node);
        });

        ws.on('close', () => {
            node.socket = undefined;
            this.log(`Lost connection to: ${node.id}`);
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
            failedNode: this.leftNode.id
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
            return node.socket.send(JSON.stringify(msg));
        else
            throw new Error(`rightNode's socket reference does not exists.`);
    }
}