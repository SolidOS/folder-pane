import type { PluginOption } from "vite"
import { solidPane, buildConfig } from "solidos-toolkit/vite"
import { defineConfig } from "vitest/config"

// `vite build --watch` reruns bundle hooks for every emitted file. Keep the
// watch loop to a single ESM output and skip generated d.ts work so the pane
// does not retrigger itself or downstream watchers on each tick.
const isWatch = process.argv.includes("--watch")

const build = buildConfig({ entry: "src/index.ts" })
if (isWatch && build && Array.isArray(build.rolldownOptions?.output)) {
  build.rolldownOptions.output = build.rolldownOptions.output.filter(
    (o: { format?: string }) => o.format === "es",
  )
}

type ConcretePlugin = Extract<PluginOption, { name: string }>

const flattenPlugins = async (input: unknown): Promise<ConcretePlugin[]> => {
  if (!input) return []
  const resolved = await input
  if (!resolved) return []
  if (Array.isArray(resolved)) {
    const nested = await Promise.all(resolved.map(flattenPlugins))
    return nested.flat()
  }
  return [resolved as ConcretePlugin]
}

const plugins = (await flattenPlugins(
  solidPane({
    litDecoratorPaths: [],
    sandbox: {
      subject: "https://testingsolidos.solidcommunity.net/",
    },
  }),
)).filter((p) => !(isWatch && /dts/i.test(p.name)))

export default defineConfig({
  build,
  plugins,
  resolve: {
    tsconfigPaths: true,
  },
})
