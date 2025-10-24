import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';

export default (client) => {
  const ordersMap = new Map(); // userId -> { channelId, embedMessageId, items: [] }

  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isCommand() && interaction.commandName === 'bestellung') {
        const allowedRoles = process.env.ORDER_ROLES ? process.env.ORDER_ROLES.split(',') : [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);
        if (!allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', ephemeral: true });
        }

        const item = interaction.options.getString('artikel');

        // Embed erstellen
        const embed = new EmbedBuilder()
          .setTitle(`📦 Bestellübersicht von ${interaction.user.username}`)
          .setDescription(`• ${item}`)
          .setColor('#00FFAA')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId('orderMenu')
          .setPlaceholder('Wähle eine Option')
          .addOptions([
            { label: 'Bestellung abgeschlossen', value: 'finish', description: 'Bestellung abschließen' },
            { label: 'Artikel hinzufügen', value: 'add', description: 'Weitere Artikel hinzufügen' },
          ]);

        const row = new ActionRowBuilder().addComponents(dropdown);

        const orderMessage = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // Speichern für weitere Interaktionen
        ordersMap.set(interaction.user.id, {
          channelId: interaction.channel.id,
          embedMessageId: orderMessage.id,
          items: [item],
        });
      }

      // Dropdown Auswahl
      if (interaction.isStringSelectMenu() && interaction.customId === 'orderMenu') {
        const orderData = ordersMap.get(interaction.user.id);
        if (!orderData) return interaction.reply({ content: '❌ Keine Bestellung gefunden!', ephemeral: true });

        if (interaction.values[0] === 'add') {
          // Modal öffnen
          const modal = new ModalBuilder()
            .setCustomId('orderAddModal')
            .setTitle('Artikel hinzufügen');

          const itemInput = new TextInputBuilder()
            .setCustomId('artikel')
            .setLabel('Artikel')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(itemInput));
          return interaction.showModal(modal);
        }

        if (interaction.values[0] === 'finish') {
          // Bestellung abschließen
          const channel = await interaction.guild.channels.fetch(orderData.channelId);
          const oldMessage = await channel.messages.fetch(orderData.embedMessageId);

          const embed = new EmbedBuilder()
            .setTitle(`✅ Bestellung von ${interaction.user.username} abgeschlossen`)
            .setDescription(orderData.items.map(i => `• ${i}`).join('\n'))
            .setColor('#00FF00')
            .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
            .setTimestamp();

          await oldMessage.edit({ embeds: [embed], components: [] });
          ordersMap.delete(interaction.user.id);
          return interaction.reply({ content: '✅ Bestellung abgeschlossen!', ephemeral: true });
        }
      }

      // Modal Submit
      if (interaction.isModalSubmit() && interaction.customId === 'orderAddModal') {
        const orderData = ordersMap.get(interaction.user.id);
        if (!orderData) return interaction.reply({ content: '❌ Keine Bestellung gefunden!', ephemeral: true });

        const newItem = interaction.fields.getTextInputValue('artikel');
        orderData.items.push(newItem);

        const channel = await interaction.guild.channels.fetch(orderData.channelId);
        const oldMessage = await channel.messages.fetch(orderData.embedMessageId);

        const embed = new EmbedBuilder()
          .setTitle(`📦 Bestellübersicht von ${interaction.user.username}`)
          .setDescription(orderData.items.map(i => `• ${i}`).join('\n'))
          .setColor('#00FFAA')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        await oldMessage.edit({ embeds: [embed] });
        return interaction.reply({ content: `✅ Artikel "${newItem}" hinzugefügt`, ephemeral: true });
      }
    } catch (err) {
      console.error('Bestellung Error:', err);
    }
  });
};


