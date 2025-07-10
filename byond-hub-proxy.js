const net = require("node:net");
const dns = require("node:dns/promises");

const fallbackHubIP = "69.39.237.88";
const fallbackHubPorts = [6001, 20002];
const secureByondUrl = "https://secure.byond.com/";

function setupTcpProxy(localPort, targetIp) {
  const server = net.createServer((localClientSocket) => {
    // if (!net.isIPv4(localClientSocket.remoteAddress)) {
    //   localClientSocket.destroy();
    //   return;
    // }
    const clientRemoteAddress = `${localClientSocket.remoteAddress}:${localClientSocket.remotePort}`;
    console.log(
      `[${localPort}] Incoming client connection from ${clientRemoteAddress}`
    );

    const targetServerSocket = new net.Socket();

    targetServerSocket.connect(localPort, targetIp, () => {
      console.log(
        `[${localPort}] Connected to target server ${targetIp}:${localPort}`
      );
    });

    targetServerSocket.on("data", (data) => {
      console.log(
        `[${localPort}] Data from target server (${data.length} bytes) -> local client`
      );
      localClientSocket.write(data);
    });

    targetServerSocket.on("end", () => {
      console.log(
        `[${localPort}] Target server disconnected. Closing local client connection.`
      );
      localClientSocket.end();
    });

    targetServerSocket.on("error", (err) => {
      console.error(
        `[${localPort}] Target server connection error: ${err.message}`
      );
      localClientSocket.destroy();
    });

    localClientSocket.on("data", (data) => {
      console.log(
        `[${localPort}] Data from local client (${data.length} bytes) -> target server`
      );
      targetServerSocket.write(data);
    });

    localClientSocket.on("end", () => {
      console.log(
        `[${localPort}] Local client ${clientRemoteAddress} disconnected. Closing target server connection.`
      );
      targetServerSocket.end();
    });

    localClientSocket.on("error", (err) => {
      console.error(
        `[${localPort}] Local client connection error from ${clientRemoteAddress}: ${err.message}`
      );
      targetServerSocket.destroy();
    });

    localClientSocket.on("close", () => {
      console.log(
        `[${localPort}] Local client ${clientRemoteAddress} connection closed.`
      );
      if (!targetServerSocket.destroyed) {
        targetServerSocket.end();
      }
    });

    targetServerSocket.on("close", () => {
      console.log(`[${localPort}] Target server connection closed.`);
      if (!localClientSocket.destroyed) {
        localClientSocket.end();
      }
    });
  });

  server.listen(localPort, () => {
    console.log(
      `TCP Proxy server listening on port ${localPort}, forwarding to ${targetIp}:${localPort}`
    );
  });

  server.on("error", (err) => {
    console.error(`[${localPort}] Server error: ${err.message}`);
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${localPort} is already in use`);
    }
  });
}

async function getHubPorts() {
  const hubPortsResponse = await (
    await fetch(new URL("HubPorts", secureByondUrl))
  ).text();
  return hubPortsResponse.trim().split(/\r?\n/).map(e=>Number.parseInt(e));
}

async function main() {
  let hubPorts, hubIP;
  try {
    hubPorts = await getHubPorts();
    console.log(`Got hub ports: ${hubPorts.join(", ")}`);
  } catch (error) {
    console.warn(
      `Failed to get hub ports! Falling back to fallback ports ${fallbackHubPorts.join(
        ", "
      )}`
    );
    hubPorts = fallbackHubPorts;
  }

  try {
    hubIP = (await dns.resolve4("hub.byond.com"))[0];
    console.log(`Got hub IP: ${hubIP}`);
  } catch (error) {
    console.error(`Failed to query hub IP!`, error);
    console.warn(`Falling back to fallback IP ${fallbackHubIP}`);
    hubIP = fallbackHubIP;
  }
  hubPorts.forEach((port) => {
    setupTcpProxy(port, hubIP);
  });
}

main();
