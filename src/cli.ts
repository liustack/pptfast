#!/usr/bin/env node
import { Command } from "commander"
import { installNodePlatform } from "./platform/node"
import {
  runInit,
  runPlanValidate,
  runPreview,
  runRender,
  runScenarios,
  runSchema,
  runThemes,
  runValidate,
} from "./cli/commands"
import { checkForUpdate, createSelfUpdater } from "./cli/update"
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
  .option("--style <path>", "style overrides JSON re-coloring the theme (see `pptfast schema --style`)")
  .option("--draft", "allow unfilled placeholder pages (skip the draft gate)")
  .action(async (ir: string, opts: { output: string; theme?: string; style?: string; draft?: boolean }) => {
    try {
      console.log(
        await runRender(ir, {
          output: opts.output,
          theme: opts.theme,
          stylePath: opts.style,
          draft: opts.draft,
        }),
      )
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
  .option("--style", "print the style-override schema instead")
  .option("--plan", "print the deck plan schema instead")
  .action((opts: { style?: boolean; plan?: boolean }) =>
    console.log(runSchema(opts.plan ? "plan" : opts.style ? "style" : undefined)),
  )

const plan = program.command("plan").description("Deck plan commands (spec §5)")
plan
  .command("validate")
  .description("Validate a deck plan JSON file against the schema and mode-aware hard gates")
  .argument("<plan.json>")
  .action(async (planPath: string) => {
    try {
      console.log(await runPlanValidate(planPath))
    } catch (e) {
      fail(e)
    }
  })

program
  .command("themes")
  .description("List built-in themes")
  .option("--json", "machine-readable output")
  .action((opts: { json?: boolean }) => console.log(runThemes(Boolean(opts.json))))

program
  .command("scenarios")
  .description("List named scenario presets (mode/delivery/audience axes + theme recommendations)")
  .option("--json", "machine-readable output")
  .action((opts: { json?: boolean }) => console.log(runScenarios(Boolean(opts.json))))

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

program
  .command("check-update")
  .description("Check npm for a newer pptfast release")
  .action(async () => {
    const info = await checkForUpdate({ currentVersion: VERSION })
    if (!info.checked) fail(new Error(`update check failed: ${info.error}`))
    console.log(
      info.updateAvailable
        ? `update available: ${info.currentVersion} → ${info.latestVersion} (run \`pptfast self-update\`)`
        : `pptfast ${info.currentVersion} is up to date`,
    )
  })

program
  .command("self-update")
  .description("Update the global pptfast install to the latest release")
  .action(async () => {
    try {
      const result = await createSelfUpdater()({ currentVersion: VERSION })
      console.log(
        result.updated
          ? `updated: ${result.currentVersion} → ${result.latestVersion}`
          : `already at the latest version (${result.currentVersion})`,
      )
    } catch (e) {
      fail(e)
    }
  })

program.parseAsync().catch(fail)
