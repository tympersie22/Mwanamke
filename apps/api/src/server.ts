import { buildApp } from "./app.js";
import { loadRuntimeConfig } from "./config.js";

const configuration = loadRuntimeConfig();
const app = await buildApp({ configuration });
await app.listen({ host: configuration.host, port: configuration.port });
