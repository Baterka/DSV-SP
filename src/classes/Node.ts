import WebSocket from 'ws';
import Http from "http";
import Express from 'express';
import bodyParser from 'body-parser';
import Debug from 'debug';
import Colors from 'colors';
import {sleep} from "../helpers";
import axios from 'axios';
import NodeId from './NodeId';
import NodeReference from "./NodeReference";
import Message from "./Message";
import SocketId from "./SocketId";

const colors: any = Colors;
colors.setTheme({
    info: 'green',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
});

/**
 * Node instance definition
 */
export default class Node {
    id: NodeId;

    rightNode: NodeReference;

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

    signedIn: boolean;

    nextDisconnectIsNotFail: boolean;

    leaderId: NodeId | undefined;

    constructor(rightNodeId: NodeId, nodeId: NodeId = new NodeId('127.0.0.1', 3000), isLeader: boolean = false) {
        this.id = nodeId;

        this.rightNode = new NodeReference(rightNodeId);

        this.leader = isLeader;
        this.watchingLeader = false;

        this.electionParticipant = false;

        this.slaveNodes = [];

        this.circleHealthy = false;
        this.sharedVariable = null;

        this.Log = Debug(this.toString());
        this.log = (msg: string) => this.Log(`[${new Date().toISOString()}] ${msg}`);

        this.signedIn = true;

        this.nextDisconnectIsNotFail = false;

        if (isLeader)
            this.leaderId = nodeId;

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
            res.json({
                node: this.getId(),
                rightNode: this.rightNode.toString(true),
                variable: this.sharedVariable,
                signedIn: this.signedIn,
                leader: this.leader,
                ...this.leader ? {
                    circleHealthy: this.circleHealthy,
                    slaves: this.slaveNodes.map(slave => slave.toString())
                } : {}
            });
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
        app.post('/variable', async (req: Express.Request, res: Express.Response) => {
            try {
                const variable = req.body.variable || undefined;
                const fromId = req.body.fromId;

                if (!fromId && !this.leader)
                    return res.json({
                        success: false,
                        error: 'I am not leader'
                    });
                if (fromId && (!this.leaderId || fromId != this.leaderId.toString())) {
                    return res.json({
                        success: false,
                        error: 'Not from leader'
                    });
                }

                if (this.leader && !this.circleHealthy)
                    return res.json({
                        success: false,
                        error: 'Not healthy'
                    });

                if (!await this.setSharedVariable(variable))
                    return res.json({
                        success: false,
                        error: 'Propagation failed'
                    });

                res.json({
                    success: true
                });
            } catch (eee) {
                return res.json({
                    success: false,
                    error: 'Unexpected error'
                });
            }
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

    private async setSharedVariable(variable: any): Promise<boolean> {
        if (!this.leader || await this.propagateVariable(variable, true)) {
            this.sharedVariable = variable;
            return true;
        }

        this.log(`Variable propagation failed. Recovering...`);
        await this.propagateVariable(this.sharedVariable);
        return false;
    }

    private async propagateVariable(variable: any, failOnFirst: boolean = false): Promise<boolean> {
        let success: boolean = true;
        for (let slave of this.slaveNodes) {
            try {
                const res = await axios.post('http://' + slave.id.toString() + '/variable', {
                    variable,
                    fromId: this.getId()
                });
                if (!res.data.success)
                    throw `Received variable set failure from: ${slave.id.toString()}`;

                this.log(`Propagated successfully to: ${slave.id.toString()}`);
            } catch (err) {
                this.log(colors.error(err.toString()));
                success = false;
                if (failOnFirst)
                    return false;
            }
        }
        return success;
    }

    private onConnection(socket: WebSocket, req: Http.IncomingMessage): void {
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

    private onMessageServer(socket: WebSocket, rawMsg: string): void {
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
                        leaderId: this.getId(),
                        forId: this.getId(),
                        slaves: []
                    }));
                } else
                    this.forwardMessage(msg);
                break;
            case 'REPORT':
                this.log(`Received REPORT from: ${payload.fromId}`);


                // Set leader reference
                if (payload.leaderId)
                    this.leaderId = NodeId.fromString(payload.leaderId);

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

                this.leaderId = NodeId.fromString(payload.newLeaderId);

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
            default:
                this.log(`Received unknown action (${msg.action}) from: ${rawMsg}`);
                break;
        }
    }

    private setHealthCorrupted(): void {
        this.circleHealthy = false;
        this.slaveNodes = [];
        this.log(colors.warn(`HEALTH OF CIRCLE IS CORRUPTED!`));

        // Start health re-check
        this.initHealthCheck();
    }

    private forwardMessage(msg: Message): void {
        try {
            // Overwrite fromId in message
            msg.payload.fromId = this.getId();

            Node.sendMessage(this.rightNode, msg);
            this.log(`Forwarded ${msg.action} to: ${this.rightNode.id}`);
        } catch (err) {
            this.log(`Failed to forward message to: ${this.rightNode.id}`);
        }
    }

    private connectToSlaves(slaves: { ipAddress: string, port: number } []): void {
        this.slaveNodes = [];
        for (let slaveJSON of slaves) {
            const slave: NodeReference = new NodeReference(NodeId.fromJSON(slaveJSON));
            this.slaveNodes.push(slave);
            this.connectToNode(slave);
        }
        this.log(colors.info(`EVERYONE REPORTED TO ME!`));
    }

    private async initHealthCheck(): Promise<void> {
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

    private async initLeaderElection(): Promise<void> {
        await sleep(1000);
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

    private sendHealthCheck(): void {
        Node.sendMessage(this.rightNode, new Message('HEALTHY', {
            forId: this.getId(),
            fromId: this.getId()
        }));
        this.log(`Sent HEALTHY to: ${this.rightNode.id}`);
    }

    private connectToNode(node: NodeReference, reconnect: boolean = false): void {
        // Do nothing when connection already exists
        if (node.socket)
            return;

        // Create new connection
        const ws = new WebSocket(`ws://${node.id}`);

        ws.on('open', () => {
            node.socket = new SocketId(ws);
            Node.sendMessage(node, new Message('HELLO', {
                fromId: this.getId(),
                watchMe: this.leader,
                reconnect
            }));

            ws.on('message', (rawMsg: string) => this.onMessageClient(ws, rawMsg));
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

    private reportNodeFailure(): void {

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

    private onMessageClient(socket: WebSocket, rawMsg: string): void {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(`Received unknown message from server: ${rawMsg}`);

        const payload: any = msg.payload;

        switch (msg.action) {
            default:
                this.log(`Received unknown action (${msg.action}) from server: ${rawMsg}`);
                break;
        }
    }

    private static sendMessage(node: NodeReference, msg: Message) {
        if (node.socket)
            return node.socket.socket.send(JSON.stringify(msg));
        else
            throw new Error(`rightNode's socket reference does not exists.`);
    }

    /**
     * Get id of current Node
     */
    getId(): string {
        return this.id.toString();
    }

    /**
     * Serialize from class instance into string
     */
    toString(): string {
        return `Node ${this.getId()}`;
    }
}