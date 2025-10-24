import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    // --- Command ---
    if (interaction.isCommand() && interaction.commandName === 'nuke') {
      try {
        const allowedRoles = process.env.NUKE_ROLES ? process.env.NUKE_ROLES.split(',') : [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);

        if (!allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Command zu nutzen!', ephemeral: true });
        }

        // Bestätigungsbuttons
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_nuke')
            .setLabel('✅ Bestätigen')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_nuke')
            .setLabel('❌ Abbrechen')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ content: '⚠️ Bist du sicher, dass du den Channel **nuken** möchtest?', components: [row], ephemeral: true });

      } catch (err) {
        console.error('Fehler beim Nuke-Command:', err);
        await interaction.reply({ content: '❌ Fehler beim Ausführen des Commands!', ephemeral: true });
      }
    }

    // --- Button-Handler ---
    if (interaction.isButton()) {
      if (interaction.customId === 'cancel_nuke') {
        await interaction.update({ content: '❌ Nuking abgebrochen!', components: [] });
        return;
      }

      if (interaction.customId === 'confirm_nuke') {
        const channel = interaction.channel;
        const clone = await channel.clone({ name: channel.name });
        await channel.delete();
        await clone.send('💥 Channel wurde erfolgreich **genuked**!');
      }
    }
  });
};

// Slash Command Definition
export const nukeCommandData = new SlashCommandBuilder()
  .setName('nuke')
  .setDescription('Löscht den gesamten Channel nach Bestätigung (nur bestimmte Rollen)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
