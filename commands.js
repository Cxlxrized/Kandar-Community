import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import { nukeCommandData } from './nuke.js';
import { orderCommandData } from './order.js';
import { paypalCommandData } from './paypal.js';
import { verifyCommandData } from './verify.js';
import { giveawayCommandData } from './giveaway.js'; // falls du Giveaways hast

export default async function registerCommands(client) {
  const commands = [
    nukeCommandData.toJSON(),
    orderCommandData.toJSON(),
    paypalCommandData.toJSON(),
    verifyCommandData.toJSON(),
    giveawayCommandData?.toJSON(), // optional
  ].filter(Boolean);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Slash Commands werden registriert...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash Commands erfolgreich registriert!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren der Commands:', err);
  }
}
