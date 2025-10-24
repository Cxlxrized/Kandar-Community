import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export default (client) => {
  client.on('interactionCreate', async interaction => {
    try {
      if (!interaction.isCommand()) return;

      // --- /finish Command ---
      if (interaction.commandName === 'finish') {
        const allowedRoles = process.env.SHOP_ROLES ? process.env.SHOP_ROLES.split(',') : [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);

        if (!allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', ephemeral: true });
        }

        // Customer-Rolle vergeben
        const customerRole = interaction.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
        if (customerRole) {
          await interaction.member.roles.add(customerRole).catch(err => console.error('Fehler beim Rollen vergeben:', err));
        }

        // Embed erstellen
        const embed = new EmbedBuilder()
          .setTitle('🛒 Shop Erlebnis Bewerten')
          .setDescription('Vielen dank für dein Einkauf bei uns! wir würden uns über ein Feedback freuen!.')
          .setColor('#00FFAA')
          .setFooter({ text: 'Kandar Community' });

        // Button für Feedback
        const feedbackButton = new ButtonBuilder()
          .setCustomId('give_feedback')
          .setLabel('Feedback geben')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(feedbackButton);

        await interaction.reply({ embeds: [embed], components: [row] });
      }

      // --- Feedback Button ---
      if (interaction.isButton() && interaction.customId === 'give_feedback') {
        const feedbackLogChannel = await interaction.guild.channels.fetch(process.env.FEEDBACK_LOG_CHANNEL_ID);

        // Modal zur Feedback Eingabe
        const modal = new ModalBuilder()
          .setCustomId('feedbackModal')
          .setTitle('Kunden Feedback');

        const feedbackInput = new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel('Dein Feedback')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Schreibe hier dein Feedback...')
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(feedbackInput)
        );

        await interaction.showModal(modal);
      }

      // --- Modal Submission ---
      if (interaction.isModalSubmit() && interaction.customId === 'feedbackModal') {
        const feedbackText = interaction.fields.getTextInputValue('feedback');
        const feedbackLogChannel = await interaction.guild.channels.fetch(process.env.FEEDBACK_LOG_CHANNEL_ID);

        await feedbackLogChannel.send({
          content: `📝 Feedback von ${interaction.user.tag}: ${feedbackText}`
        });

        await interaction.reply({ content: '✅ Dein Feedback wurde abgeschickt!', ephemeral: true });

        // Originale Nachricht mit Button löschen
        if (interaction.message) {
          interaction.message.delete().catch(() => {});
        }
      }

    } catch (err) {
      console.error('Finish Command Error:', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
      }
    }
  });
};
