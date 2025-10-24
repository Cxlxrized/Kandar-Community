import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import express from 'express';

// Module importieren
import welcome from './welcome.js';
import tickets from './tickets.js';
import paypal from './paypal.js';
import registerCommands from './commands.js';
import boost from './boost.js';
import verify from './verify.js';
import giveaway from './giveaway.js'; // <-- Giveaway Modul

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
welcome(client);       // Welcome-Embed
tickets(client);       // Ticket-System
paypal(client);        // PayPal Command
boost(client);         // Boost-Nachrichten
verify(client);        // Verify Command
giveaway(client);      // Giveaway-System
registerCommands(client); // Slash-Commands registrieren

// === Bot Login ===
client.login(process.env.DISCORD_TOKEN);
