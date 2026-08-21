import readline from "node:readline"
import { PptfastError } from "../errors"

export interface SecretInputIo {
  stdin: NodeJS.ReadableStream
  stderr: NodeJS.WritableStream
}

/**
 * Read a secret. TTY: hidden prompt on stderr so stdout stays clean.
 * Non-TTY: first line of stdin, trimmed. Empty after trim is an error.
 */
export async function readSecret(prompt: string, io: SecretInputIo = { stdin: process.stdin, stderr: process.stderr }): Promise<string> {
  const { stdin, stderr } = io
  const isTTY = Boolean((stdin as NodeJS.ReadStream).isTTY)
  if (!isTTY) {
    const line = await readFirstLine(stdin)
    if (line === "") throw new PptfastError("API key cannot be empty")
    return line
  }
  return await readHiddenTty(prompt, stdin, stderr)
}

function readFirstLine(stdin: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoding = ((stdin as NodeJS.ReadableStream & { readableEncoding?: BufferEncoding | null }).readableEncoding) ?? "utf8"
    let buf = ""
    const onData = (chunk: string | Buffer) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString(encoding)
      const nl = buf.indexOf("\n")
      if (nl === -1) return
      cleanup()
      resolve(buf.slice(0, nl).replace(/\r$/, "").trim())
    }
    const onEnd = () => {
      cleanup()
      resolve(buf.replace(/\r$/, "").trim())
    }
    const onError = (e: Error) => {
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      stdin.off("data", onData)
      stdin.off("end", onEnd)
      stdin.off("error", onError)
    }
    stdin.on("data", onData)
    stdin.on("end", onEnd)
    stdin.on("error", onError)
  })
}

function readHiddenTty(prompt: string, stdin: NodeJS.ReadableStream, stderr: NodeJS.WritableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: stdin, output: stderr, terminal: true })
    const mutable = rl as unknown as { _writeToOutput: (s: string) => void }
    mutable._writeToOutput = () => {
      // swallow echo so the value never appears on the terminal
    }
    stderr.write(prompt)
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    rl.question("", (answer) => {
      finish(() => {
        rl.close()
        stderr.write("\n")
        const value = answer.trim()
        if (value === "") reject(new PptfastError("API key cannot be empty"))
        else resolve(value)
      })
    })
    rl.on("SIGINT", () => {
      finish(() => {
        rl.close()
        stderr.write("\n")
        reject(new PptfastError("cancelled"))
      })
    })
    rl.on("close", () => {
      finish(() => reject(new PptfastError("cancelled")))
    })
  })
}
