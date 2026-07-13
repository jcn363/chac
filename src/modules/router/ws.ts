import type { Kernel } from "../../kernel/types";
import type { ChatService } from "../chat/service";
import { extractErrorMessage } from "../../utils/db-helpers";

interface WsClient {
  ws: Bun.ServerWebSocket<undefined>;
  sessionId?: string;
}

const clients = new Set<WsClient>();

function handleMessage(kernel: Kernel, client: WsClient, raw: string): void {
  let data: { type: string; sessionId?: string; message?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    client.ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
    return;
  }

  if (data.type === "chat" && data.sessionId && data.message) {
    handleChatMessage(kernel, client, data.sessionId, data.message);
  }
}

async function handleChatMessage(
  kernel: Kernel,
  client: WsClient,
  sessionId: string,
  message: string,
): Promise<void> {
  const chat = kernel.get<ChatService>("chat");

  client.ws.send(JSON.stringify({ type: "chat:start", sessionId }));

  try {
    await chat.sendMessage(sessionId, message, {
      onChunk(chunk) {
        client.ws.send(JSON.stringify({ type: "chat:chunk", content: chunk }));
      },
      onDone(msg) {
        client.ws.send(JSON.stringify({ type: "chat:done", message: msg }));
      },
    });
  } catch (err) {
    client.ws.send(JSON.stringify({
      type: "chat:error",
      error: extractErrorMessage(err),
    }));
  }
}

export function setupWebSocket(kernel: Kernel) {
  const chat = kernel.get<ChatService>("chat");

  return {
    open(ws: Bun.ServerWebSocket<undefined>) {
      // Require auth token in query string
      const url = new URL("http://localhost");
      const token = url.searchParams.get("token");

      if (!token) {
        ws.close(4001, "Authentication required");
        return;
      }

      // Validate token belongs to an existing session
      const session = chat.validateSessionTokenByToken(token);
      if (!session) {
        ws.close(4003, "Invalid token");
        return;
      }

      const client: WsClient = { ws, sessionId: session.id };
      clients.add(client);
    },
    message(ws: Bun.ServerWebSocket<undefined>, message: string | Buffer) {
      const client = [...clients].find((c) => c.ws === ws);
      if (client) {
        handleMessage(kernel, client, typeof message === "string" ? message : message.toString());
      }
    },
    close(ws: Bun.ServerWebSocket<undefined>) {
      const client = [...clients].find((c) => c.ws === ws);
      if (client) clients.delete(client);
    },
  };
}
