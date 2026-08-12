import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  manifest: {
    name: "GitHub Actions Explorer",
    description:
      "An unofficial extension to search, group, and quickly reopen workflows in the GitHub Actions sidebar.",
    permissions: ["storage"],
  },
})
