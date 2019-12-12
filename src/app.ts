import {Node, NodeId, NodeReference} from "./Node";

// Default IP address for testing
const defaultIpAddress = '127.0.0.1';

function sleep(ms: number){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

// List of nodes to fork
const nodes: NodeId[] = [
    new NodeId(defaultIpAddress, 3001),
    new NodeId(defaultIpAddress, 3002),
    new NodeId(defaultIpAddress, 3003),
    // new NodeId(defaultIpAddress, 3004),
    // new NodeId(defaultIpAddress, 3005),
];

//  Fork nodes
const nodesCount = nodes.length;

async function init(){
    for (let i = 0; i < nodesCount; i++) {
        await sleep(2000);
        new Node(
            nodes[i === 0 ? nodesCount - 1 : i - 1],
            nodes[i === nodesCount - 1 ? 0 : i + 1],
            nodes[i],
            i === 0
        );
    }
}

init();