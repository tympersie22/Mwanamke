import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Patient and account responses are dynamic and must never enter a shared cache.
export default defineCloudflareConfig();
