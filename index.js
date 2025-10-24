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

// === Client erstellen ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// === Commands ===
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

    // === Ticket-Erstellung ===
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticketSelect') {
      const type = interaction.values[0];
      const emojiMap = {
        shop: '💰',
        kandar: '✍️',
        designer: '🎨',
        cutter: '✂️',
        streamer: '🎥',
        highteam: '👑',
        support: '🛠️'
      };

      // Shop: Öffne Modal vor Ticket-Erstellung
      if (type === 'shop') {
        const modal = new ModalBuilder()
          .setCustomId('shopTicketModal')
          .setTitle('💰 Shop Ticket erstellen');

        const paymentInput = new TextInputBuilder()
          .setCustomId('payment')
          .setLabel('Zahlungsmethode (z. B. PayPal, Bank, Crypto)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const articleInput = new TextInputBuilder()
          .setCustomId('article')
          .setLabel('Artikel (z. B. Overlay, Banner, Logo)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(paymentInput),
          new ActionRowBuilder().addComponents(articleInput)
        );

        interaction.user._pendingTicketType = 'shop';
        await interaction.showModal(modal);
        return;
      }

      // Für alle anderen Ticketarten → direkt Channel erstellen
      await createTicket(interaction, type, emojiMap[type]);
      return;
    }

    // === Shop Modal Submit ===
    if (interaction.isModalSubmit() && interaction.customId === 'shopTicketModal') {
      const payment = interaction.fields.getTextInputValue('payment');
      const article = interaction.fields.getTextInputValue('article');
      const type = 'shop';
      const emoji = '💰';

      const ticket = await createTicket(interaction, type, emoji);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('💰 Shop Ticket')
        .setDescription(
          `**Zahlungsmethode:** ${payment}\n**Artikel:** ${article}\n\nBitte schildere dein Anliegen unten.`
        );

      const closeBtn = new ButtonBuilder().setCustomId('closeTicket').setLabel('🔒 Schließen').setStyle(ButtonStyle.Danger);
      await ticket.send({ content: `${interaction.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });

      await interaction.reply({ content: `✅ Dein Shop-Ticket wurde erstellt: ${ticket}`, flags: 64 });
      return;
    }

    // === Ticket schließen ===
    if (interaction.isButton() && interaction.customId === 'closeTicket') {
      await interaction.channel.send('📁 Ticket wird geschlossen...');
      await interaction.channel.delete().catch(() => {});
      return;
    }

  } catch (err) {
    console.error('❌ Fehler in Interaktion:', err);
    if (!interaction.replied)
      await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', flags: 64 });
  }
});

// === Funktion: Ticket erstellen ===
async function createTicket(interaction, type, emoji) {
  const guild = interaction.guild;
  const categoryName = `${type.charAt(0).toUpperCase() + type.slice(1)} Tickets`;
  let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
  if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

  const ticket = await guild.channels.create({
    name: `${emoji}-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
    ],
  });

  const closeBtn = new ButtonBuilder().setCustomId('closeTicket').setLabel('🔒 Schließen').setStyle(ButtonStyle.Danger);
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle(`${emoji} Ticket erstellt`)
    .setDescription('Bitte schildere dein Anliegen.');

  await ticket.send({ content: `${interaction.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
  return ticket;
}

// === LOGGING SYSTEM ===

// 👥 MEMBER LOGS
client.on('guildMemberAdd', async member => {
  const log = member.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('👋 Neuer Member beigetreten')
    .setDescription(`${member} ist dem Server beigetreten!`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async member => {
  const log = member.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚪 Member hat den Server verlassen')
    .setDescription(`${member.user?.tag || 'Unbekannt'} (${member.id}) hat den Server verlassen.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const log = newMember.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (!log) return;

  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (addedRoles.size > 0 || removedRoles.size > 0) {
    const embed = new EmbedBuilder()
      .setColor('#FFFF00')
      .setTitle('🧩 Rollenänderung')
      .setDescription(`Bei ${newMember} wurden Rollen geändert.`)
      .addFields(
        { name: 'Hinzugefügt', value: addedRoles.map(r => r.name).join(', ') || 'Keine' },
        { name: 'Entfernt', value: removedRoles.map(r => r.name).join(', ') || 'Keine' }
      )
      .setTimestamp();
    log.send({ embeds: [embed] });
  }
});

// 💬 MESSAGE LOGS
client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;
  const log = message.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (!log) return;

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🗑️ Nachricht gelöscht')
    .addFields(
      { name: 'User', value: `${message.author}`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Inhalt', value: message.content || '[Embed/Anhang]' }
    )
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  const log = newMsg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (!log) return;
  if (oldMsg.content === newMsg.content) return;

  const embed = new EmbedBuilder()
    .setColor('#FFFF00')
    .setTitle('✏️ Nachricht bearbeitet')
    .addFields(
      { name: 'User', value: `${newMsg.author}`, inline: true },
      { name: 'Channel', value: `${newMsg.channel}`, inline: true },
      { name: 'Vorher', value: oldMsg.content || '[Leer]' },
      { name: 'Nachher', value: newMsg.content || '[Leer]' }
    )
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// 📢 CHANNEL LOGS
client.on('channelCreate', async channel => {
  if (!channel.guild) return;
  const log = channel.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📢 Channel erstellt')
    .setDescription(`**${channel.name}** wurde erstellt (${channel.type}).`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('channelDelete', async channel => {
  if (!channel.guild) return;
  const log = channel.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('📢 Channel gelöscht')
    .setDescription(`**${channel.name}** wurde gelöscht.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  const log = newChannel.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (!log) return;
  if (oldChannel.name !== newChannel.name) {
    const embed = new EmbedBuilder()
      .setColor('#FFFF00')
      .setTitle('📢 Channel umbenannt')
      .setDescription(`**${oldChannel.name}** → **${newChannel.name}**`)
      .setTimestamp();
    log.send({ embeds: [embed] });
  }
});

// 🎭 ROLE LOGS
client.on('roleCreate', async role => {
  const log = role.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🎭 Rolle erstellt')
    .setDescription(`Rolle **${role.name}** wurde erstellt.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('roleDelete', async role => {
  const log = role.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🎭 Rolle gelöscht')
    .setDescription(`Rolle **${role.name}** wurde gelöscht.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on('roleUpdate', async (oldRole, newRole) => {
  const log = newRole.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (!log) return;
  if (oldRole.name !== newRole.name) {
    const embed = new EmbedBuilder()
      .setColor('#FFFF00')
      .setTitle('🎭 Rolle umbenannt')
      .setDescription(`**${oldRole.name}** → **${newRole.name}**`)
      .setTimestamp();
    log.send({ embeds: [embed] });
  }
});

// ⚙️ SERVER LOGS
client.on('guildUpdate', async (oldGuild, newGuild) => {
  const log = newGuild.channels.cache.get(process.env.SERVER_LOGS_CHANNEL_ID);
  if (!log) return;

  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push('🖼️ Server-Icon geändert.');
  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('⚙️ Server geändert')
    .setDescription(changes.join('\n'))
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// 🔊 VOICE LOGS
client.on('voiceStateUpdate', async (oldState, newState) => {
  const log = newState.guild.channels.cache.get(process.env.VOICE_LOGS_CHANNEL_ID);
  if (!log) return;

  const user = newState.member.user;
  let desc = '';

  if (!oldState.channel && newState.channel)
    desc = `🎙️ ${user} ist **${newState.channel.name}** beigetreten.`;
  else if (oldState.channel && !newState.channel)
    desc = `🔇 ${user} hat **${oldState.channel.name}** verlassen.`;
  else if (oldState.channelId !== newState.channelId)
    desc = `🔁 ${user} wechselte von **${oldState.channel.name}** zu **${newState.channel.name}**.`;

  if (!desc) return;
  const embed = new EmbedBuilder()
    .setColor('#00A8FF')
    .setTitle('🔊 Voice Aktivität')
    .setDescription(desc)
    .setTimestamp();
  log.send({ embeds: [embed] });
});


// === Login ===
client.login(process.env.DISCORD_TOKEN);

