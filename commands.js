import { SlashCommandBuilder, REST, Routes } from 'discord.js';
import 'dotenv/config';

export default async (client) => {
  const commands = [
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Antwortet mit Pong!'),

    new SlashCommandBuilder()
      .setName('serverstats')
      .setDescription('Zeigt Server-Statistiken an'),

    new SlashCommandBuilder()
      .setName('paypal')
      .setDescription('Erstellt einen PayPal-Zahlungslink')
      .addNumberOption(option =>
        option.setName('betrag')
              .setDescription('Betrag in Euro')
              .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('ticketmsg')
      .setDescription('Sendet das Ticket-Auswahl-Embed'),

    new SlashCommandBuilder()
      .setName('finish')
      .setDescription('Gib Feedback an einen Customer (nur berechtigte Rollen)'),

    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Zeigt das Regelwerk an und gibt die Rolle beim Klick'),

    // === Giveaway Command mit Tage, Stunden, Minuten ===
    new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Verwalte ein Giveaway')
      .addSubcommand(sub =>
        sub.setName('start')
           .setDescription('Starte ein Giveaway')
           .addChannelOption(opt => opt.setName('channel').setDescription('Channel für das Giveaway').setRequired(true))
           .addStringOption(opt => opt.setName('preis').setDescription('Preis des Giveaways').setRequired(true))
           .addIntegerOption(opt => opt.setName('tage').setDescription('Dauer in Tagen'))
           .addIntegerOption(opt => opt.setName('stunden').setDescription('Dauer in Stunden'))
           .addIntegerOption(opt => opt.setName('minuten').setDescription('Dauer in Minuten'))
      )
      .addSubcommand(sub =>
        sub.setName('end')
           .setDescription('Beende ein Giveaway')
           .addStringOption(opt => opt.setName('messageid').setDescription('ID der Giveaway Nachricht').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('reroll')
           .setDescription('Ziehe einen neuen Gewinner für ein Giveaway')
           .addStringOption(opt => opt.setName('messageid').setDescription('ID der Giveaway Nachricht').setRequired(true))
      ),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Slash Commands werden registriert...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('✅ Slash Commands erfolgreich geladen!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren der Slash Commands:', err);
  }
};
