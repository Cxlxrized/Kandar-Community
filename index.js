import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import express from 'express';

// Module importieren
import welcome from './welcome.js';
import tickets from './tickets.js';
import paypal from './paypal.js';
import boost from './boost.js';
import verify from './verify.js';
import twitch from './twitch.js';
import order from './order.js';
import nuke from './nuke.js';
import startStats from './stats.js'; // <-- stats.js importieren

// === Client erstellen ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === Webserver für Railway Keep-Alive ===
const app = express();
app.get('/', (req, res) => res.send('✅ Bot läuft auf Railway!'));
app.listen(process.env.PORT || 3000, () => console.log('🌍 Webserver läuft'));

// === Module laden ===
welcome(client);
tickets(client);
paypal(client);
boost(client);
verify(client);
twitch(client);
order(client);
nuke(client);

// === Stats starten ===
startStats(client); // <-- stats.js mit dem Client starten

// === Bot Login ===
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🤖 Bot erfolgreich eingeloggt!'))
  .catch(err => console.error('❌ Bot Login fehlgeschlagen:', err));





