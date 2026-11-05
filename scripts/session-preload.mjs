// Only for the isolated session suite: the Neon driver speaks the PostgreSQL
// protocol over a WebSocket, so this gives it a plain socket to the temporary
// local server. Nothing here reaches production code or any remote service.
import net from "node:net";

const port = Number(process.env.PAPELITO_SESSION_PG_PORT);
if (!port) throw new Error("PAPELITO_SESSION_PG_PORT is required.");

class LocalPostgresSocket extends EventTarget {
  binaryType = "arraybuffer";
  readyState = 0;

  constructor() {
    super();
    this.socket = net.connect(port, "127.0.0.1");
    this.socket.on("connect", () => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
    this.socket.on("data", (chunk) => {
      const data = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length);
      this.dispatchEvent(new MessageEvent("message", { data }));
    });
    // A reset ends in "close", which the driver reports to whoever is waiting.
    this.socket.on("error", () => this.socket.destroy());
    this.socket.on("close", () => {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    });
  }

  send(data) {
    this.socket.write(Buffer.from(data));
  }

  close() {
    this.socket.end();
  }
}

globalThis.WebSocket = LocalPostgresSocket;
