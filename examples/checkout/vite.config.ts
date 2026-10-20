import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const browserIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};

const webzjsWalletPackageRoot: Plugin = {
  name: "webzjs-wallet-package-root",
  configureServer(server) {
    server.middlewares.use(rewriteWebZjsWalletPackageRoot);
  },
  configurePreviewServer(server) {
    server.middlewares.use(rewriteWebZjsWalletPackageRoot);
  }
};

const webzjsWalletBrowserImport: Plugin = {
  name: "webzjs-wallet-browser-import",
  apply: "serve",
  transform(code, id) {
    if (!id.endsWith("/dist/browser-wallet.js")) return undefined;

    return code.replace(
      'import("@chainsafe/webzjs-wallet")',
      'import(/* @vite-ignore */ globalThis.location.origin + "/webzjs-wallet/webzjs_wallet.js")'
    );
  }
};

function rewriteWebZjsWalletPackageRoot(
  request: { url?: string },
  _response: unknown,
  next: () => void
): void {
  if (
    request.url === "/webzjs-wallet" ||
    request.url === "/webzjs-wallet/"
  ) {
    request.url = "/webzjs-wallet/webzjs_wallet.js";
  }
  next();
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.GITHUB_ACTIONS === "true"
    ? "/zcash-payment-sessions/"
    : "/",
  plugins: [webzjsWalletPackageRoot, webzjsWalletBrowserImport],
  server: {
    headers: browserIsolationHeaders
  },
  preview: {
    headers: browserIsolationHeaders
  },
  build: {
    outDir: fileURLToPath(new URL("../../dist-demo", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      external: ["@chainsafe/webzjs-wallet"],
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        checkout: fileURLToPath(new URL("checkout.html", import.meta.url))
      }
    }
  }
});
