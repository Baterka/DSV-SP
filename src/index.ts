import * as yargs from 'yargs';
import {Node, NodeId} from "./classes";

interface Arguments {
    [x: string]: unknown;

    ip: string | undefined;
    port: number | undefined;
    rightIp: string | undefined;
    rightPort: number | undefined;
    leader: boolean | undefined;
}

const argv: Arguments = yargs.options({
    ip: {type: 'string'},
    port: {type: 'number'},
    rightIp: {type: 'string'},
    rightPort: {type: 'number'},
    leader: {type: 'boolean'},
}).argv;

if (!argv.ip || !argv.port || !argv.rightIp || !argv.rightPort) {
    let missing = "";
    for (let arg of [
        'ip',
        'port',
        'rightIp',
        'rightPort'
    ]) {
        if (!argv[arg])
            missing += '--' + arg + (arg !== 'rightPort' ? ', ' : '');
    }
    console.log(`Missing arguments: ${missing}`);
    process.exit();
}

const node = new NodeId(argv.ip, argv.port);
const rightNode = new NodeId(argv.rightIp, argv.rightPort);

// Fork node
new Node(rightNode, node, !!argv.leader);