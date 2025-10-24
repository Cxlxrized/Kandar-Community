import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';

export default (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      // -------------------- /creator add --------------------
      if (interaction.isCommand() && interaction.commandName === 'creator') {
        if (interaction.options.getSubcommand() === 'add') {
          const modal = new ModalBuilder()
            .setCustomId('creatorAddModal')
            .setTitle('Creator hinzufügen');

          const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Titel des Embeds')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const creatorIdInput = new TextInputBuilder()
            .setCustomId('creatorId')
            .setLabel('Discord-ID des Creators')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const twitchInput = new TextInputBuilder()
            .setCustomId('twitch')
            .setLabel('Twitch Link (Pflicht)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const tiktokInput = new TextInputBuilder()
            .setCustomId('tiktok')
            .setLabel('TikTok Link (Optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const youtubeInput = new TextInputBuilder()
            .setCustomId('youtube')
            .setLabel('YouTube Link (Optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const instaInput = new TextInputBuilder()
            .setCustomId('instagram')
            .setLabel('Instagram Link (Optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          const codeInput = new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Creator Code (Optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

          // Modal Komponenten als Array hinzufügen
          modal.addComponents([
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(creatorIdInput),
            new ActionRowBuilder().addComponents(twitchInput),
            new ActionRowBuilder().addComponents(tiktokInput),
            new ActionRowBuilder().addComponents(youtubeInput),
            new ActionRowBuilder().addComponents(instaInput),
            new ActionRowBuilder().addComponents(codeInput)
          ]);

          await interaction.showModal(modal);
          return;
        }
      }

      // -------------------- /creator Modal Submit --------------------
      if (interaction.isModalSubmit() && interaction.customId === 'creatorAddModal') {
        const title = interaction.fields.getTextInputValue('title');
        const creatorId = interaction.fields.getTextInputValue('creatorId');
        const twitch = interaction.fields.getTextInputValue('twitch');
        const tiktok = interaction.fields.getTextInputValue('tiktok') || '';
        const youtube = interaction.fields.getTextInputValue('youtube') || '';
        const instagram = interaction.fields.getTextInputValue('instagram') || '';
        const code = interaction.fields.getTextInputValue('code') || '';

        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '❌ Guild nicht gefunden!', ephemeral: true });

        // Rolle vergeben
        const member = guild.members.cache.get(creatorId);
        if (member) {
          const role = guild.roles.cache.find(r => r.name === 'Creator');
          if (role) await member.roles.add(role).catch(console.error);
        }

        // Embed erstellen
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor('#9b5de5')
          .addFields({ name: 'Twitch', value: twitch })
          .setTimestamp();

        if (tiktok) embed.addFields({ name: 'TikTok', value: tiktok });
        if (youtube) embed.addFields({ name: 'YouTube', value: youtube });
        if (instagram) embed.addFields({ name: 'Instagram', value: instagram });
        if (code) embed.addFields({ name: 'Creator Code', value: code });

        // Admin Buttons
        const adminRow = new ActionRowBuilder().addComponents([
          new ButtonBuilder()
            .setCustomId('editCreator')
            .setLabel('Bearbeiten')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('deleteCreator')
            .setLabel('Löschen')
            .setStyle(ButtonStyle.Danger)
        ]);

        // Social Link Buttons
        const socialRow = new ActionRowBuilder();
        if (twitch) socialRow.addComponents(new ButtonBuilder().setLabel('Twitch').setStyle(ButtonStyle.Link).setURL(twitch));
        if (tiktok) socialRow.addComponents(new ButtonBuilder().setLabel('TikTok').setStyle(ButtonStyle.Link).setURL(tiktok));
        if (youtube) socialRow.addComponents(new ButtonBuilder().setLabel('YouTube').setStyle(ButtonStyle.Link).setURL(youtube));
        if (instagram) socialRow.addComponents(new ButtonBuilder().setLabel('Instagram').setStyle(ButtonStyle.Link).setURL(instagram));

        const message = await interaction.reply({ embeds: [embed], components: [adminRow, socialRow], fetchReply: true });

        // Creator speichern
        const filePath = './data/creators.json';
        const creators = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
        creators.push({
          title,
          creatorId,
          twitch,
          tiktok,
          youtube,
          instagram,
          code,
          messageId: message.id,
          channelId: message.channel.id
        });
        fs.writeFileSync(filePath, JSON.stringify(creators, null, 2));

        await interaction.followUp({ content: '✅ Creator erstellt und Rolle vergeben!', ephemeral: true });
      }

    } catch (error) {
      console.error('Fehler bei Commands:', error);
      if (!interaction.replied) await interaction.reply({ content: '❌ Fehler aufgetreten!', ephemeral: true });
    }
  });
};

     