// api/index.impl.ts
import { createApiApp } from '../server/api/app';
import { registerRoutes } from '../server/routes';

const app = createApiApp();
registerRoutes(app);

export default app;