import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';

export const embedCommand = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Erstellt ein individuelles Embed via Modal'),
  allowedRoles: ['Admin', 'Moderator'], // Rollen, die den Command nutzen dürfen
  async execute(interaction) {
    // Rollen-Check
    const memberRoles = interaction.member.roles.cache.map(r => r.name);
    if (!this.allowedRoles.some(r => memberRoles.includes(r))) {
      await interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Command zu benutzen.', ephemeral: true });
      return;
    }

    // Modal erstellen
    const modal = new ModalBuilder()
      .setCustomId('embedModal')
      .setTitle('Neues Embed erstellen');

    const titleInput = new TextInputBuilder()
      .setCustomId('embedTitle')
      .setLabel('Titel')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('embedDescription')
      .setLabel('Beschreibung')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const colorInput = new TextInputBuilder()
      .setCustomId('embedColor')
      .setLabel('Farbe (Hex z.B. #00FF00)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const footerInput = new TextInputBuilder()
      .setCustomId('embedFooter')
      .setLabel('Footer Text')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const thumbnailInput = new TextInputBuilder()
      .setCustomId('embedThumbnail')
      .setLabel('Thumbnail URL')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const field1Input = new TextInputBuilder()
      .setCustomId('field1')
      .setLabel('Feld 1 (Format: Name|Wert)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const field2Input = new TextInputBuilder()
      .setCustomId('field2')
      .setLabel('Feld 2 (Format: Name|Wert)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const field3Input = new TextInputBuilder()
      .setCustomId('field3')
      .setLabel('Feld 3 (Format: Name|Wert)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descriptionInput),
      new ActionRowBuilder().addComponents(colorInput),
      new ActionRowBuilder().addComponents(footerInput),
      new ActionRowBuilder().addComponents(thumbnailInput),
      new ActionRowBuilder().addComponents(field1Input),
      new ActionRowBuilder().addComponents(field2Input),
      new ActionRowBuilder().addComponents(field3Input)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const title = interaction.fields.getTextInputValue('embedTitle');
    const description = interaction.fields.getTextInputValue('embedDescription');
    const color = interaction.fields.getTextInputValue('embedColor') || '#00FF00';
    const footer = interaction.fields.getTextInputValue('embedFooter');
    const thumbnail = interaction.fields.getTextInputValue('embedThumbnail');
    const fields = [
      interaction.fields.getTextInputValue('field1'),
      interaction.fields.getTextInputValue('field2'),
      interaction.fields.getTextInputValue('field3')
    ].filter(f => f);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (footer) embed.setFooter({ text: footer });
    if (thumbnail) embed.setThumbnail(thumbnail);

    fields.forEach(f => {
      const [name, value] = f.split('|');
      if (name && value) embed.addFields({ name: name.trim(), value: value.trim(), inline: true });
    });

    await interaction.reply({ content: '✅ Embed erstellt!', ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
  }
};
