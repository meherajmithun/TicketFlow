import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
createApp(config).listen(config.port, () => {
  console.info(`TicketFlow API listening on port ${config.port}`);
});
