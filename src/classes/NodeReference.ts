import NodeId from "./NodeId";
import SocketId from "./SocketId";

/**
 * Reference to Node and WebSocket tunnel between
 */
export default class NodeReference {
    id: NodeId;
    socket: SocketId | undefined;

    constructor(id: NodeId, socket?: SocketId) {
        this.id = id;
        this.socket = socket;
    }

    /**
     * Serialize from class instance into string
     */
    toString(connInfo: boolean = false): string {
        return `${this.id}${connInfo ? this.socket ? ' CONNECTED' : ' DISCONNECTED' : ''}`;
    }
}