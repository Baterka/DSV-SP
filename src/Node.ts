import WebSocket from 'ws';
import Http from 'http';
import Debug from 'debug';

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

    constructor(ipAddress: string, port: number) {
        this.ipAddress = ipAddress;
        this.port = port;
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
    slaveNodes: Array<NodeReference>;

    topologyHealthy: boolean;

    log: Debug.Debugger;

    httpServer: Http.Server | undefined;
    wsServer: WebSocket.Server | undefined;

    constructor(leftNodeId: NodeId, rightNodeId: NodeId, nodeId: NodeId = new NodeId('127.0.0.1', 3000), isLeader = false) {
        this.id = nodeId;

        this.leftNode = new NodeReference(leftNodeId);
        this.rightNode = new NodeReference(rightNodeId);

        this.leader = isLeader;
        this.slaveNodes = [];

        this.topologyHealthy = false;

        this.log = Debug(this.toString());

        this.startServer();
    }

    private startServer() {

        // Create HTTP server
        this.httpServer = Http.createServer((req, res) => {
            res.writeHead(200);
            res.write(`
                <html>
                    <b>NODE:</b> ${this.getId()}<br>   
                    <b>Leader:</b> ${this.leader ? 'Yes' : 'No'}<br>
                    <b>Topology healthy:</b> ${this.topologyHealthy ? 'Yes' : 'No'}<br><br> 
                    <b>leftNode:</b> ${this.leftNode}<br>      
                    <b>rightNode:</b> ${this.rightNode}<br>     
                </html>
            `);
            res.end();
        });

        // Create WS server
        this.wsServer = new WebSocket.Server({
            server: this.httpServer
        });

        // Listen for connections
        this.wsServer.on('connection', this.onConnection.bind(this));

        // Start HTTP server
        this.httpServer.listen(this.id.port, this.id.ipAddress, () => {
            this.log(`HTTP server listening on port ${this.id.port}`);
        });

        if (this.leader || this.leftNode.socket)
            this.connectToRightNode();
    }

    private onConnection(socket: WebSocket, req: Http.IncomingMessage) {
        socket.on('message', (msg: string) => this.onMessageServer(socket, msg));

        socket.on('close', () => {
            this.log('Connection closed.');
        });
    }

    private onMessageServer(socket: WebSocket, rawMsg: string) {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(`Received unknown message from client: ${rawMsg}`);

        const payload: any = msg.payload;

        switch (msg.action) {
            case 'HELLO':

                // Set reference to left node
                this.leftNode = new NodeReference(payload.id, socket);

                this.log(`New connection from: ${payload.id}`);
                this.sendMessage(socket, new Message('HELLO', {
                    id: this.getId()
                }));

                setTimeout(() => {
                    if (this.leader) {
                        this.log("Sending HEALTHY");
                        this.topologyHealthy = true;
                        if (this.rightNode.socket)
                            this.sendMessage(this.rightNode.socket, new Message('HEALTHY', {
                                healthy: true
                            }));
                    }
                }, 1000);

                break;
            case 'HEALTHY': {
                this.log("Received HEALTHY");
                if (!this.topologyHealthy) {
                    this.topologyHealthy = payload.healthy;
                    if (this.rightNode.socket)
                        this.sendMessage(this.rightNode.socket, new Message('HEALTHY', {
                            healthy: true
                        }));
                }
            }
        }
    }

    getId() {
        return `${this.id}`;
    }

    toString() {
        return `Node ${this.getId()}`;
    }

    private connectToRightNode() {

        // Do nothing when connection already exists
        if (this.rightNode.socket)
            return;

        // Create new connection
        const ws = new WebSocket(`ws://${this.rightNode.id}`);

        ws.on('open', () => {

            this.rightNode.socket = ws;
            this.sendMessage(ws, new Message('HELLO', {
                id: this.getId()
            }));

            ws.on('message', (rawMsg: string) => this.onMessageClient(ws, rawMsg));
        });

        ws.on('error', this.connectToRightNode);
    }

    private onMessageClient(socket: WebSocket, rawMsg: string) {
        const msg: Message = Message.makeMessage(rawMsg);
        if (!msg.action)
            return this.log(`Received unknown message from server: ${rawMsg}`);

        const payload: any = msg.payload;

        switch (msg.action) {
            case 'HELLO':
                this.log(`Connected to: ${payload.id}`);
                break;
        }
    }

    private sendMessage(socket: WebSocket, msg: Message) {
        return socket.send(JSON.stringify(msg));
    }
}