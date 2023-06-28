import * as net from "net";

// Correct message format:
//  - One token: registration                   `[desired identity]`
//  - Two tokens: message to be forwarded       `[destination identity] [message]`
//      The payload cannot contain spaces
//
// The server connects and sends a registration token.
// The client connects and sends a registration token.
// The client sends a forward message to the server identity.
//
// Example sequence:
//    server:   SERVER_ID
//    client:   CLIENT_ID
//    client:   SERVER_ID payload

const clientConnections = new Map<string, net.Socket>();
const clientConnectionsReverse = new Map<net.Socket, string>();

const getAddress = (connection: net.Socket) => {
  return `${connection.remoteAddress}:${connection.remotePort}`;
};

const oneTokenMessage = (data: string[], connection: net.Socket) => {
  const address = getAddress(connection);

  const identity = data[0];
  if (clientConnections.has(identity)) {
    console.error(`Ignoring duplicated registration from ${address}: ${data}`);
    return;
  }

  clientConnections.set(identity, connection);
  clientConnectionsReverse.set(connection, identity);
  console.log(`Added connection [${identity}@${address}]`);
};

const twoTokenMessage = (
  rawData: Buffer,
  data: string[],
  connection: net.Socket
) => {
  const identity = clientConnectionsReverse.get(connection);
  if (!identity) {
    console.error(
      `Ignoring message from unregistered connection ${getAddress(connection)}`
    );
    return;
  }

  const destinationIdentity = data[0];
  const destinationConnection = clientConnections.get(destinationIdentity);
  if (!destinationConnection) {
    console.error(
      `Ignoring message from [${identity}] to unknown destination [${destinationIdentity}]`
    );
    return;
  }

  const spaceIndex = rawData.findIndex((v) => v === 32);
  const message = rawData.subarray(spaceIndex + 1);
  destinationConnection.write(message);
  console.log(`Sending message from [${identity}] to [${destinationIdentity}]`);
};

const closeConnection = (connection: net.Socket) => {
  const identity = clientConnectionsReverse.get(connection);
  if (identity) {
    console.log(`Cleared connection [${identity}]`);
    if (identity) {
      clientConnections.delete(identity);
    }
    clientConnectionsReverse.delete(connection);
  }
};

const ServiceConnection = (connection: net.Socket) => {
  connection.on("data", (rawData: Buffer) => {
    const data = rawData.toString().trim().split(" ");
    if (data.length == 0) {
      return;
    }

    try {
      const address = `${connection.remoteAddress}:${connection.remotePort}`;
      switch (data.length) {
        case 0:
          console.error(`Ignoring empty message from ${address}`);
          break;
        case 1:
          oneTokenMessage(data, connection);
          break;
        case 2:
          twoTokenMessage(rawData, data, connection);
          break;
        default:
          console.error(
            `Ignoring message with too many arguments from ${address}: '${data}'`
          );
      }
    } catch (e) {
      console.error(e);
    }
  });

  connection.on("close", () => {
    closeConnection(connection);
  });

  connection.on("error", (err) => {
    closeConnection(connection);
    if ((err as any).code !== "ECONNRESET") {
      console.error(err);
    }
  });
};

const main = () => {
  const server = net.createServer();
  server.listen(10000, "0.0.0.0", () => {
    console.log(`Listening on port 10000`);
  });

  server.on("connection", (connection) => {
    ServiceConnection(connection);
  });
};

main();
