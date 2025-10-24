import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import express from 'express';

import welcome from './welcome.js';
import tickets from './tickets.js';
import paypal from './paypal.js';
import registerCommands from './commands.js';
import boost from './boost.js';
import twitch from './twitch.js';
import verify from './verify.js';
import order from './order.js'; // ✅ NEU

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const app = express();
app.get('/', (req, res) => res.send('✅ Bot läuft!'));
app.listen(process.env.PORT || 3000, () => console.log('🌍 Webserver läuft'));

// Modules
welcome(client);
tickets(client);
paypal(client);
boost(client);
twitch(client);
verify(client);
order(client); // ✅ NEU

registerCommands(client);
client.login(process.env.DISCORD_TOKEN);

