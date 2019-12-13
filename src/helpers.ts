/**
 * Shuffle array by Durstenfeld shuffle algorithm
 * @param array
 */
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
