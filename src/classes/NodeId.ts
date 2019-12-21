import {ip2int} from "../helpers";

/**
 * Identification of Node
 */
export default class NodeId {
    ipAddress: string;
    port: number;
    size: number;

    constructor(ipAddress: string, port: number) {
        this.ipAddress = ipAddress;
        this.port = port;

        this.size = parseInt('' + ip2int(ipAddress) + port);
    }

    /**
     * Serialize from class instance into string
     */
    toString(): string {
        return this.ipAddress + ':' + this.port;
    }

    /**
     * Serialize from class instance into JSON
     */
    toJSON(): {ipAddress: string, port: number} {
        return {
            ipAddress: this.ipAddress,
            port: this.port,
        }
    }

    /**
     * Serialize from class instance into number
     */
    toNumber(): number {
        return this.size;
    }

    /**
     * Deserialize from JSON into class instance
     */
    static fromJSON(json: { ipAddress: string, port: number }): NodeId {
        return new NodeId(json.ipAddress, json.port);
    }

    /**
     * Deserialize from string into class instance
     */
    static fromString(string: string): NodeId {
        const split = string.split(':');
        return new NodeId(split[0], parseInt(split[1]));
    }
}