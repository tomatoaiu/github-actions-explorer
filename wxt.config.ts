import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  manifest: {
    name: "GitHub Actions Explorer",
    description:
      "Search, group, and quickly reopen workflows in the GitHub Actions sidebar.",
    permissions: ["storage"],
  },
})
