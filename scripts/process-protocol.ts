import { isRecord } from "./root";

function protocolRecord(frame: string): Record<string, unknown> | undefined {
  try {
    const message: unknown = JSON.parse(frame);
    return isRecord(message) ? message : undefined;
  } catch {
    return undefined;
  }
}

export function readProtocol(
  delimiter: "\n" | "\0",
  receive: (message: Record<string, unknown> | undefined) => boolean,
) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    // Only a chunk with a delimiter can complete a frame. A Chrome PDF can span many chunks.
    if (!chunk.includes(delimiter)) return;
    for (let end = buffer.indexOf(delimiter); end >= 0; end = buffer.indexOf(delimiter)) {
      const message = protocolRecord(buffer.slice(0, end));
      buffer = buffer.slice(end + delimiter.length);
      if (!receive(message)) return;
    }
  };
}
