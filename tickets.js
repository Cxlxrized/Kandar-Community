import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import fs from 'fs';

export default (client) => {
  client.on('interactionCreate', async interaction => {
    try {
      // --- /ticketmsg Command ---
      if (interaction.isCommand() && interaction.commandName === 'ticketmsg') {
        const allowedRoles = process.env.TICKETMSG_ROLES ? process.env.TICKETMSG_ROLES.split(',') : [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);
        if (!allowedRoles.some(r => memberRoles.includes(r)))
          return interaction.reply({ content: '❌ Keine Rechte!', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('🎫 Erstelle dein Ticket')
          .setDescription(
            `Bitte wähle die Ticket-Art unten aus:\n\n` +
            `💰 **Shop Ticket** - Für Käufe\n` +
            `✍️ **Kandar Bewerbung** - Bewerbung für Kandar\n` +
            `🎨 **Designer Bewerbung** - Bewerbung für Designer\n` +
            `✂️ **Cutter Bewerbung** - Bewerbung für Cutter\n` +
            `🎥 **Streamer Bewerbung** - Bewerbung für Streamer\n` +
            `🛠️ **Support Ticket** - Für allgemeine Hilfe / Support`
          )
          .setColor('#00FF00')
          .setImage('https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId('ticketSelect')
          .setPlaceholder('Ticket auswählen')
          .addOptions([
            { label: 'Shop', value: 'shop', emoji: '💰', description: 'Für Käufe' },
            { label: 'Kandar Bewerbung', value: 'kandar', emoji: '✍️', description: 'Bewerbung für Kandar' },
            { label: 'Designer Bewerbung', value: 'designer', emoji: '🎨', description: 'Bewerbung für Designer' },
            { label: 'Cutter Bewerbung', value: 'cutter', emoji: '✂️', description: 'Bewerbung für Cutter' },
            { label: 'Streamer Bewerbung', value: 'streamer', emoji: '🎥', description: 'Bewerbung für Streamer' },
            { label: 'Support', value: 'support', emoji: '🛠️', description: 'Allgemeine Hilfe / Support' },
          ]);

        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(dropdown)] });
      }

      // --- Dropdown Auswahl ---
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticketSelect') {
        const choice = interaction.values[0];

        // --- Shop Modal ---
        if (choice === 'shop') {
          const modal = new ModalBuilder()
            .setCustomId('shopModal')
            .setTitle('Shop Ticket Details');

          const paymentInput = new TextInputBuilder()
            .setCustomId('paymentMethod')
            .setLabel('Zahlungsmethode')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('z.B. PayPal, Überweisung')
            .setRequired(true);

          const itemInput = new TextInputBuilder()
            .setCustomId('itemName')
            .setLabel('Artikel / Kauf')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Was möchtest du erwerben?')
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(paymentInput),
            new ActionRowBuilder().addComponents(itemInput)
          );

          return interaction.showModal(modal);
        }

        // --- Streamer Modal ---
        if (choice === 'streamer') {
          const modal = new ModalBuilder()
            .setCustomId('streamerModal')
            .setTitle('Streamer Bewerbung');

          const twitchInput = new TextInputBuilder()
            .setCustomId('twitchName')
            .setLabel('Twitch-Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Dein Twitch-Benutzername')
            .setRequired(true);

          const followersInput = new TextInputBuilder()
            .setCustomId('followers')
            .setLabel('Follower-Anzahl')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('z.B. 1234')
            .setRequired(true);

          const avgViewersInput = new TextInputBuilder()
            .setCustomId('avgViewers')
            .setLabel('Durchschnittliche Zuschauer')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('z.B. 50')
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(twitchInput),
            new ActionRowBuilder().addComponents(followersInput),
            new ActionRowBuilder().addComponents(avgViewersInput)
          );

          return interaction.showModal(modal);
        }

        // --- Andere Tickets / Support ---
        let categoryName, channelName;
        switch(choice){
          case 'kandar': categoryName='Kandar Bewerbungen'; channelName=`✍️-${interaction.user.username}`; break;
          case 'designer': categoryName='Designer Bewerbungen'; channelName=`🎨-${interaction.user.username}`; break;
          case 'cutter': categoryName='Cutter Bewerbungen'; channelName=`✂️-${interaction.user.username}`; break;
          case 'support': categoryName='Support Tickets'; channelName=`🛠️-${interaction.user.username}`; break;
          default: return;
        }

        let category = interaction.guild.channels.cache.find(c => c.name===categoryName && c.type===ChannelType.GuildCategory);
        if(!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setTitle(`${choice === 'support' ? '🛠️ Support Ticket' : `🎫 ${choice.charAt(0).toUpperCase()+choice.slice(1)} Ticket`}`)
          .setDescription(`Hallo ${interaction.user}, bitte schildere dein Anliegen hier.`)
          .setColor('#00FF00')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

        const closeButton = new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Ticket schließen')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger);

        await ticketChannel.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeButton)] });
        await interaction.reply({ content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}`, ephemeral: true });
      }

      // --- Modal Submission für Shop ---
      if (interaction.isModalSubmit() && interaction.customId === 'shopModal') {
        const paymentMethod = interaction.fields.getTextInputValue('paymentMethod');
        const itemName = interaction.fields.getTextInputValue('itemName');

        const categoryName = 'Shop Tickets';
        let category = interaction.guild.channels.cache.find(c => c.name===categoryName && c.type===ChannelType.GuildCategory);
        if(!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

        const channelName = `💰-${interaction.user.username}`;
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
          ]
        });

        const embed = new EmbedBuilder()
          .setTitle('💳 Shop Ticket Details')
          .addFields(
            { name: 'Benutzer', value: `${interaction.user}`, inline: true },
            { name: 'Zahlungsmethode', value: paymentMethod, inline: true },
            { name: 'Artikel / Kauf', value: itemName, inline: false }
          )
          .setColor('#00FFAA')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        await ticketChannel.send({ content:`${interaction.user}`, embeds:[embed], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Ticket schließen').setEmoji('🔒').setStyle(ButtonStyle.Danger))] });
        await interaction.reply({ content: `✅ Dein Shop-Ticket wurde erstellt: ${ticketChannel}`, ephemeral: true });
      }

      // --- Modal Submission für Streamer ---
      if (interaction.isModalSubmit() && interaction.customId === 'streamerModal') {
        const twitchName = interaction.fields.getTextInputValue('twitchName');
        const followers = interaction.fields.getTextInputValue('followers');
        const avgViewers = interaction.fields.getTextInputValue('avgViewers');

        const categoryName = 'Streamer Bewerbungen';
        let category = interaction.guild.channels.cache.find(c => c.name===categoryName && c.type===ChannelType.GuildCategory);
        if(!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

        const channelName = `🎥-${interaction.user.username}`;
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
          ]
        });

        const embed = new EmbedBuilder()
          .setTitle('🎥 Streamer Bewerbung')
          .addFields(
            { name: 'Benutzer', value: `${interaction.user}`, inline: true },
            { name: 'Twitch-Name', value: twitchName, inline: true },
            { name: 'Follower', value: followers, inline: true },
            { name: 'Durchschnittliche Zuschauer', value: avgViewers, inline: true }
          )
          .setColor('#00AAFF')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        await ticketChannel.send({ content:`${interaction.user}`, embeds:[embed], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Ticket schließen').setEmoji('🔒').setStyle(ButtonStyle.Danger))] });
        await interaction.reply({ content: `✅ Dein Streamer-Ticket wurde erstellt: ${ticketChannel}`, ephemeral: true });
      }

      // --- Ticket Close Buttons ---
      if (interaction.isButton()) {
        const { customId } = interaction;
        if (customId==='close_ticket') {
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_close_ticket').setLabel('✅ Schließen').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_close_ticket').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Secondary)
          );
          return interaction.reply({ content: 'Bist du sicher, dass du das Ticket schließen willst?', components: [confirmRow] });
        }

        if(customId==='cancel_close_ticket') return interaction.update({ content: '❌ Ticket-Schließung abgebrochen!', components: [] });

        if(customId==='confirm_close_ticket') {
          await interaction.reply({ content: '📦 Erstelle Transkript und schließe das Ticket...', ephemeral:false });
          const logChannel = interaction.guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);

          try {
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const sortedMessages = Array.from(messages.values()).reverse();
            let transcript = `--- 📜 Ticket-Transkript ---\nServer: ${interaction.guild.name}\nChannel: ${interaction.channel.name}\nGeschlossen von: ${interaction.user.tag}\nZeit: ${new Date().toLocaleString()}\n\n`;
            for(const msg of sortedMessages) transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author?.tag||'Unbekannt'}: ${msg.content||'[Anhang/Nachricht leer]'}\n`;

            const path = `./transcript_${interaction.channel.id}.txt`;
            fs.writeFileSync(path, transcript, 'utf8');

            const embed = new EmbedBuilder()
              .setTitle('📁 Ticket geschlossen')
              .setDescription(`Das Ticket **${interaction.channel.name}** wurde geschlossen und archiviert.`)
              .addFields(
                { name:'Geschlossen von', value:`${interaction.user}`, inline:true },
                { name:'Ticket-ID', value:`\`${interaction.channel.id}\``, inline:true }
              )
              .setColor('#FF0000')
              .setTimestamp()
              .setFooter({ text:'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic:true }) });

            if(logChannel) await logChannel.send({ embeds:[embed], files:[path] });
            await interaction.followUp({ content:'✅ Ticket wird in 5 Sekunden gelöscht...', ephemeral:false });

            setTimeout(async ()=>{
              fs.unlinkSync(path);
              await interaction.channel.delete().catch(()=>{});
            },5000);
          } catch(err){ console.error('Transkript Error:',err); await interaction.followUp({ content:'❌ Fehler beim Erstellen des Transkripts!', ephemeral:true }); }
        }
      }

    } catch(error){ console.error('Tickets Interaction Error:',error); }
  });
};
