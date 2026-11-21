// Workspace registry: the one place workspaces are listed. Order = tab order.
import { registerWorkspace } from '../shell.js';
import today from './today.js';
import longterm from './longterm.js';
import markets from './markets.js';
import research from './research.js';
import macro from './macro.js';
import world from './world.js';
import news from './news.js';

for (const ws of [today, longterm, markets, research, macro, world, news]) registerWorkspace(ws);
