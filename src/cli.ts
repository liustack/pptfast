#!/usr/bin/env node
import { Command } from "commander"
import { installNodePlatform } from "./platform/node"
import { runInit, runPreview, runRender, runSchema, runThemes, runValidate } from "./cli/commands"
import { VERSION } from "./version"

installNodePlatform()

const program = new Command()
program
  .name("pptfast")
  .description("Stable, editable PPTX generation for AI agents — semantic IR in, native DrawingML out")
  .version(VERSION)

function fail(e: unknown): never {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}

program
  .command("render")
  .description("Render an IR JSON file to a .pptx")
  .argument("<ir.json>", "path to the IR file")
  .requiredOption("-o, --output <file>", "output .pptx path")
  .option("--theme <id>", "override the deck theme (see `pptfast themes`)")
  .option("--tokens <path>", "brand tokens JSON overriding the theme palette (see `pptfast schema --tokens`)")
  .action(async (ir: string, opts: { output: string; theme?: string; tokens?: string }) => {
    try {
      console.log(await runRender(ir, { output: opts.output, theme: opts.theme, tokensPath: opts.tokens }))
    } catch (e) {
      fail(e)
    }
  })

program
  .command("validate")
  .description("Validate an IR JSON file against the schema")
  .argument("<ir.json>")
  .action(async (ir: string) => {
    try {
      console.log(await runValidate(ir))
    } catch (e) {
      fail(e)
    }
  })

program
  .command("schema")
  .description("Print the IR JSON Schema (feed this to a model before it writes IR)")
  .option("--tokens", "print the brand-tokens override schema instead")
  .action((opts: { tokens?: boolean }) => console.log(runSchema(Boolean(opts.tokens))))

program
  .command("themes")
  .description("List built-in themes")
  .option("--json", "machine-readable output")
  .action((opts: { json?: boolean }) => console.log(runThemes(Boolean(opts.json))))

program
  .command("init")
  .description("Scaffold a pptfast.config.json in the current directory")
  .action(async () => {
    try {
      console.log(await runInit())
    } catch (e) {
      fail(e)
    }
  })

program
  .command("preview")
  .description("Render each slide to an SVG file for visual self-check")
  .argument("<ir.json>")
  .requiredOption("-o, --output <dir>", "output directory")
  .action(async (ir: string, opts: { output: string }) => {
    try {
      console.log(await runPreview(ir, opts.output))
    } catch (e) {
      fail(e)
    }
  })

program.parseAsync().catch(fail)
