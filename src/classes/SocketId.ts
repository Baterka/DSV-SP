import WebSocket from "ws";

/**
 * Identification of WebSocket
 */
export default class SocketId {
    id: number;
    socket: WebSocket;

    constructor(socket: WebSocket, id: number = -1) {
        this.socket = socket;
        this.id = id;
    }
}