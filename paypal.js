import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isCommand() || interaction.commandName !== 'paypal') return;

      // Rollen prüfen
      const allowedRoles = process.env.PAYPAL_ROLES ? process.env.PAYPAL_ROLES.split(',') : [];
      const memberRoles = interaction.member.roles.cache.map(r => r.id);

      if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
        return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', ephemeral: true });
      }

      // Betrag abrufen
      const amount = interaction.options.getNumber('betrag');
      if (!amount || amount <= 0) {
        return interaction.reply({ content: '⚠️ Bitte gib einen gültigen Betrag ein!', ephemeral: true });
      }

      // PayPal-Link generieren
      const paypalLink = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;

      // Embed erstellen
      const embed = new EmbedBuilder()
        .setTitle('💰 PayPal Zahlung')
        .setDescription(`Klicke auf den Button unten, um **${amount}€** zu zahlen.`)
        .setColor('#0099ff')
        .setImage('https://cdn.discordapp.com/attachments/1310294304280719441/1310313363142371368/paypal-banner.png')
        .setFooter({
          text: 'Kandar Community',
          iconURL: interaction.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();

      // Button erstellen
      const button = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(paypalLink);

      const row = new ActionRowBuilder().addComponents(button);

      // Antwort senden
      await interaction.reply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error('PayPal Command Error:', err);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Fehler im PayPal Command!', ephemeral: true });
      }
    }
  });
};
