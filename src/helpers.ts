/**
 * Shuffle array by Durstenfeld shuffle algorithm
 * @param array
 */
import {Node} from "./Node";

export function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

/**
 * Promise based thread wait/sleep
 * @param ms
 */
export function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

/**
 * Convert string IPv4 address into Integer representation
 * https://gist.github.com/jppommet/5708697
 * @param ip
 */
export function ip2int(ip: string) {
    return ip.split('.').reduce(function (ipInt, octet) {
        return (ipInt << 8) + parseInt(octet, 10)
    }, 0) >>> 0;
}

/**
 * Template for HTTP server root page
 * @param node
 * @param slaveList
 */
export function nodeRootPage(node: Node) {
    let slaveList: string = '';
    let first: boolean = true;
    for (let slave of node.slaveNodes) {
        slaveList += `
<tr>
    <td><b>${first ? 'Slaves:' : ''}</b></td>
    <td>${slave}</td>
</tr>
                    `;
        first = false;
    }
    return `
<html>
    <table>
        <thead>
            <tr>
                <td><b>Node:</b></td>
                <td>${node.getId()}</td>
            </tr>
        </thead>
        <tbody>
            <!--<tr>
                <td><b>leftNode:</b></td>
                <td>${/*node.leftNode*/undefined}</td>
            </tr>-->
            <tr>
                <td><b>rightNode:</b></td>
                <td>${node.rightNode}</td>
            </tr>
            <tr>
                <td><b>Variable:</b></td>
                <td>${node.sharedVariable || '[not_set]'}</td>
            </tr>
            <tr>
                <td><b>SignedIn:</b></td>
                <td>${node.signedIn ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
                <td><b>Leader:</b></td>
                <td>${node.leader ? 'Yes' : 'No'}</td>
            </tr>
        </tbody>
    </table><br>
    ${node.leader ? `
    <table>
        <tbody>
        <tr>
            <td><b>Circle healthy:</b></td>
            <td>${node.circleHealthy ? `Yes` : `No`}</td>
        </tr>
        ${slaveList}
        </tbody>
    </table>
    ` : ``}
</html>
`;
}
