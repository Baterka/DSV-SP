import {Node, NodeId, NodeReference} from "./Node";
import * as yargs from 'yargs';

interface Arguments {
    [x: string]: unknown;

    port: number | undefined;
    leftPort: number | undefined;
    rightPort: number | undefined;
    leader: boolean | undefined;
}

const argv: Arguments = yargs.options({
    port: {type: 'number'},
    leftPort: {type: 'number'},
    rightPort: {type: 'number'},
    leader: {type: 'boolean'},
}).argv;

// Default IP address for testing
const defaultIpAddress = '127.0.0.1';

if (!argv.port || !argv.leftPort || !argv.rightPort) {
    console.log('Invalid arguments!');
    process.exit();
}

const node = new NodeId(defaultIpAddress, argv.port);
const leftNode = new NodeId(defaultIpAddress, argv.leftPort);
const rightNode = new NodeId(defaultIpAddress, argv.rightPort);

// Fork node
new Node(leftNode, rightNode, node, !!argv.leader);