/**
 * Message transferred between Nodes over WebSocket
 */
export default class Message {
    action: string;
    payload: any;

    constructor(action: string, payload: {} = {}) {
        this.action = action;
        this.payload = payload;
    }

    /**
     * Class to JSON
     */
    toJSON(): {action: string, payload: {}} {
        return {
            action: this.action,
            payload: this.payload
        }
    }

    /**
     * Deserialize from string into class instance
     */
    static makeMessage(string: string): Message {
            const msg: { action: string, payload: {} } = JSON.parse(string);
            if (msg.action && msg.payload)
                return new Message(msg.action, msg.payload);
            throw 'Invalid input string format';
    }
}