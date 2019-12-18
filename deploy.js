let Client = require('ssh2-sftp-client');
let fs = require('fs');

if (!process.argv[2]) {
    console.log("IP address template is required (for example 192.168.1.x)");
    process.exit();
}

const ipAddress = id => {
    return process.argv[2].replace("x", id);
};
const defaultPort = parseInt(process.argv[3] || 3000);

const username = 'root';
const password = 'root';

const servers = [
    {
        id: 1,
        rightNode: 2,
        leader: true,
    },
    {
        id: 2,
        rightNode: 3,
    },
    {
        id: 3,
        rightNode: 4,
    },
    {
        id: 4,
        rightNode: 5,
    },
    {
        id: 5,
        rightNode: 1,
    },
];

const remoteDir = '/root/DSV/';
const filesToDeploy = fs.readdirSync('build/');
const startScript = server => Buffer.from(`
#!/bin/sh

# Make sure NodeJS & npm is installed
if ! type "node" > /dev/null; then
  apt install curl
  curl -sL https://deb.nodesource.com/setup_12.x | bash -
  apt install nodejs
fi

# Make sure yarn is installed
npm install yarn -g

# Install dependencies
yarn install

# Run Node
npm run fork -- --ip=${ipAddress(server.id)} --port=${defaultPort} --rightIp=${ipAddress(server.rightNode)} --rightPort=${defaultPort} ${server.leader ? '--leader=true' : ''}
`, 'utf-8');

const deployToServer = async server => {
    let sftp = new Client();
    const host = ipAddress(server.id);
    console.log(`Connecting to ${host}...`);
    await sftp.connect({host, port: 22, username, password});
    console.log(`Connected!`);

    console.log(`Deploying...`);
    try {
        await sftp.rmdir(remoteDir + 'build/', true);
    } catch (err) {
        //console.log('Nothing to delete...');
    }
    await sftp.mkdir(remoteDir + 'build/', true);

    for (let i in filesToDeploy) {
        const file = filesToDeploy[i];
        //console.log(`Uploading '${file}'...`);
        await sftp.put('build/' + file, remoteDir + 'build/' + file);
    }
    await sftp.put('package.json', remoteDir + 'package.json');
    await sftp.put(startScript(server), remoteDir + 'start.sh', {
        mode: 0o777 // Make file executable
    });

    console.log(`Deployed!`);
    await sftp.end();
};

const init = async () => {
    try {
        for (let server of servers) {
            await deployToServer(server);
        }
    } catch (err) {
        console.log(err);
    }
};

// Deploy
init();