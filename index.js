import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from 'discord.js';
import 'dotenv/config';
import fs from 'fs';

// === Client ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === Slash Commands ===
const commands = [
  new SlashCommandBuilder()
    .setName('paypal')
    .setDescription('Erstellt einen PayPal-Zahlungslink')
    .addNumberOption(o => o.setName('betrag').setDescription('Betrag in Euro').setRequired(true)),

  new SlashCommandBuilder()
    .setName('order')
    .setDescription('Erstellt eine Bestellung')
    .addStringOption(o => o.setName('artikel').setDescription('Artikelname').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticketmsg')
    .setDescription('Sendet das Ticket-Auswahlpanel'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Sendet das Regelwerk & den Verify-Button'),

  new SlashCommandBuilder()
    .setName('creator')
    .setDescription('Creator-System')
    .addSubcommand(sc => sc.setName('add').setDescription('Creator hinzufügen'))
    .addSubcommand(sc => sc.setName('list').setDescription('Zeigt alle Creator')),

  new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Löscht alle Nachrichten im aktuellen Channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());

// === Command Registrierung ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('🔄 Registriere Commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registriert!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren:', err);
  }
})();

// === Ready ===
client.once('ready', () => console.log(`🤖 Bot online als ${client.user.tag}`));

// === Welcome Embed ===
client.on('guildMemberAdd', async member => {
  const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
  const channel = member.guild.channels.cache.get(welcomeChannelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('👋 Willkommen auf dem Server!')
    .setDescription(`Willkommen ${member}, schön, dass du dabei bist! 🎉`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// === Interactions ===
client.on('interactionCreate', async interaction => {
  try {
    // ---------------- PAYPAL ----------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'paypal') {
      const amount = interaction.options.getNumber('betrag');
      if (!amount || amount <= 0)
        return interaction.reply({ content: '⚠️ Bitte einen gültigen Betrag eingeben!', flags: 64 });

      const link = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('💰 PayPal Zahlung')
        .setDescription(`Klicke unten, um **${amount}€** zu zahlen.`)
        .setFooter({ text: 'Kandar Community' });

      const button = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(link);

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      return;
    }

    // ---------------- ORDER ----------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'order') {
      const artikel = interaction.options.getString('artikel');
      const userId = interaction.user.id;
      if (!global.orders) global.orders = new Map();
      if (!global.orders.has(userId)) global.orders.set(userId, []);
      global.orders.get(userId).push(artikel);

      const embed = new EmbedBuilder()
        .setColor('#00A8FF')
        .setTitle(`🛒 Bestellung von ${interaction.user.username}`)
        .setDescription(global.orders.get(userId).map((a, i) => `**${i + 1}.** ${a}`).join('\n'));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('orderMenu')
        .setPlaceholder('Aktion auswählen')
        .addOptions([
          { label: 'Artikel hinzufügen', value: 'add' },
          { label: 'Bestellung abschließen', value: 'finish' }
        ]);

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'orderMenu') {
      const userId = interaction.user.id;
      if (!global.orders || !global.orders.has(userId))
        return interaction.reply({ content: '❌ Keine Bestellung gefunden!', flags: 64 });

      if (interaction.values[0] === 'add') {
        const modal = new ModalBuilder().setCustomId('addOrder').setTitle('Artikel hinzufügen');
        const input = new TextInputBuilder().setCustomId('artikel').setLabel('Artikelname').setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.values[0] === 'finish') {
        global.orders.delete(userId);
        const embed = new EmbedBuilder().setColor('#00FF6E').setTitle('✅ Bestellung abgeschlossen');
        await interaction.update({ embeds: [embed], components: [] });
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'addOrder') {
      const artikel = interaction.fields.getTextInputValue('artikel');
      const userId = interaction.user.id;
      if (!global.orders || !global.orders.has(userId))
        return interaction.reply({ content: '❌ Keine Bestellung gefunden!', flags: 64 });

      global.orders.get(userId).push(artikel);

      const embed = new EmbedBuilder()
        .setColor('#00A8FF')
        .setTitle(`🛒 Bestellung von ${interaction.user.username}`)
        .setDescription(global.orders.get(userId).map((a, i) => `**${i + 1}.** ${a}`).join('\n'));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('orderMenu')
        .setPlaceholder('Aktion auswählen')
        .addOptions([
          { label: 'Artikel hinzufügen', value: 'add' },
          { label: 'Bestellung abschließen', value: 'finish' }
        ]);

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }

    // ---------------- TICKET PANEL ----------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticketmsg') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket-System')
        .setColor('#00FF00')
        .setImage('https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif')
        .setDescription(
          `Bitte wähle unten deine Kategorie:\n\n` +
          `💰 **Shop Ticket**\n✍️ **Kandar Bewerbung**\n🎨 **Designer Bewerbung**\n✂️ **Cutter Bewerbung**\n🎥 **Streamer Bewerbung**\n👑 **Highteam Anliegen**\n🛠️ **Support**`
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticketSelect')
        .setPlaceholder('Wähle eine Kategorie')
        .addOptions([
          { label: 'Shop Ticket', value: 'shop', emoji: '💰' },
          { label: 'Kandar Bewerbung', value: 'kandar', emoji: '✍️' },
          { label: 'Designer Bewerbung', value: 'designer', emoji: '🎨' },
          { label: 'Cutter Bewerbung', value: 'cutter', emoji: '✂️' },
          { label: 'Streamer Bewerbung', value: 'streamer', emoji: '🎥' },
          { label: 'Highteam Anliegen', value: 'highteam', emoji: '👑' },
          { label: 'Support', value: 'support', emoji: '🛠️' }
        ]);

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }

    // Ticket erstellen
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticketSelect') {
      const type = interaction.values[0];
      const guild = interaction.guild;
      const categoryName = `${type.charAt(0).toUpperCase() + type.slice(1)} Tickets`;
      let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
      if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

      const ticket = await guild.channels.create({
        name: `${type}-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
        ],
      });

      const closeBtn = new ButtonBuilder().setCustomId('closeTicket').setLabel('🔒 Schließen').setStyle(ButtonStyle.Danger);

      // Shop Ticket mit Dropdown
      if (type === 'shop') {
        const shopMenu = new StringSelectMenuBuilder()
          .setCustomId('shopOptions')
          .setPlaceholder('Wähle Zahlungsmethode & Artikel')
          .addOptions([
            { label: 'PayPal - Overlay', value: 'paypal_overlay' },
            { label: 'PayPal - Design', value: 'paypal_design' },
            { label: 'Bank - Overlay', value: 'bank_overlay' },
            { label: 'Bank - Design', value: 'bank_design' },
          ]);

        await ticket.send({
          content: `${interaction.user}`,
          embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('💰 Shop Ticket').setDescription('Bitte wähle unten Zahlungsmethode & Artikel.')],
          components: [new ActionRowBuilder().addComponents(shopMenu), new ActionRowBuilder().addComponents(closeBtn)],
        });
      }

      // Streamer Bewerbung öffnet Modal
      else if (type === 'streamer') {
        const modal = new ModalBuilder()
          .setCustomId('streamerBewerbung')
          .setTitle('🎥 Streamer Bewerbung');

        const followerInput = new TextInputBuilder()
          .setCustomId('followers')
          .setLabel('Follower Anzahl')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const avgViewerInput = new TextInputBuilder()
          .setCustomId('avg_viewers')
          .setLabel('Average Viewer')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const twitchLinkInput = new TextInputBuilder()
          .setCustomId('twitch_link')
          .setLabel('Twitch-Link')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(followerInput),
          new ActionRowBuilder().addComponents(avgViewerInput),
          new ActionRowBuilder().addComponents(twitchLinkInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // Alle anderen Tickets normal
      else {
        await ticket.send({
          content: `${interaction.user}`,
          embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('🎫 Ticket erstellt').setDescription('Bitte schildere dein Anliegen.')],
          components: [new ActionRowBuilder().addComponents(closeBtn)],
        });
      }

      await interaction.reply({ content: `✅ Ticket erstellt: ${ticket}`, flags: 64 });
      return;
    }

    // Streamer Bewerbung Modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'streamerBewerbung') {
      const followers = interaction.fields.getTextInputValue('followers');
      const avgViewers = interaction.fields.getTextInputValue('avg_viewers');
      const twitchLink = interaction.fields.getTextInputValue('twitch_link');

      const guild = interaction.guild;
      const categoryName = `Streamer Tickets`;
      let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
      if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

      const ticket = await guild.channels.create({
        name: `streamer-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎥 Streamer Bewerbung')
        .addFields(
          { name: 'Follower', value: followers, inline: true },
          { name: 'Average Viewer', value: avgViewers, inline: true },
          { name: 'Twitch-Link', value: twitchLink }
        )
        .setFooter({ text: `Streamer Bewerbung von ${interaction.user.username}` });

      await ticket.send({ content: `${interaction.user}`, embeds: [embed] });
      await interaction.reply({ content: `✅ Bewerbung erstellt: ${ticket}`, flags: 64 });
      return;
    }

    // Ticket schließen
    if (interaction.isButton() && interaction.customId === 'closeTicket') {
      await interaction.channel.send('📁 Ticket wird geschlossen...');
      await interaction.channel.delete().catch(() => {});
      return;
    }

    // === Creator System (aus vorheriger Nachricht einfügen, unverändert) ===

  } catch (err) {
    console.error('❌ Fehler in Interaktionen:', err);
    if (!interaction.replied)
      await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', flags: 64 });
  }
});

// === Login ===
client.login(process.env.DISCORD_TOKEN);
