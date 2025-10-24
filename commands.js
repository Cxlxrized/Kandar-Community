import { SlashCommandBuilder } from 'discord.js';

export default (client) => {
  const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Antwortet mit Pong!'),
    new SlashCommandBuilder().setName('serverstats').setDescription('Zeigt Server-Statistiken an'),
    new SlashCommandBuilder().setName('shop').setDescription('Erstelle ein Shop-Ticket (nur bestimmte Rollen)'),
    new SlashCommandBuilder().setName('order').setDescription('Verwalte deine Bestellungen (nur bestimmte Rollen)').addStringOption(option =>
      option.setName('artikel')
            .setDescription('Artikel den du bestellen möchtest')
            .setRequired(true)
    ),
    new SlashCommandBuilder().setName('verify').setDescription('Zeige die Regeln und erhalte die Rolle'),
    new SlashCommandBuilder().setName('finish').setDescription('Markiere Feedback als erledigt (nur bestimmte Rollen)'),
    new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway erstellen / löschen / reroll')
      .addStringOption(option =>
        option.setName('aktion')
              .setDescription('Erstellen, löschen oder rerollen')
              .setRequired(true)
      ),
    new SlashCommandBuilder().setName('paypal').setDescription('Erstelle einen PayPal-Link').addNumberOption(option =>
      option.setName('betrag')
            .setDescription('Betrag in Euro')
            .setRequired(true)
    )
  ].map(c => c.toJSON());

  import('discord.js').then(({ REST, Routes }) => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    (async () => {
      try {
        console.log('🔄 Commands werden registriert/überschrieben...');
        await rest.put(
          Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
          { body: commands }
        );
        console.log('✅ Commands registriert!');
      } catch (err) {
        console.error('❌ Fehler beim Registrieren der Commands:', err);
      }
    })();
  });
};

