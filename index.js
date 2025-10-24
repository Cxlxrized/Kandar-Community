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
  ],
});

// === Slash-Commands ===
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Antwortet mit Pong!'),
  new SlashCommandBuilder().setName('paypal').setDescription('Erstellt einen PayPal-Link')
    .addNumberOption(o => o.setName('betrag').setDescription('Betrag in Euro').setRequired(true)),

  new SlashCommandBuilder()
    .setName('creator')
    .setDescription('Creator-Verwaltung')
    .addSubcommand(sc => sc.setName('add').setDescription('Fügt einen Creator hinzu'))
    .addSubcommand(sc => sc.setName('list').setDescription('Zeigt alle gespeicherten Creator an')),
].map(c => c.toJSON());

// === Commands registrieren ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('🔄 Commands werden registriert...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registriert!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren der Commands:', err);
  }
})();

// === Bot Ready ===
client.once('ready', () => {
  console.log(`🤖 Bot ist online als ${client.user.tag}`);
});

// === Interactions ===
client.on('interactionCreate', async (interaction) => {
  try {
    // === /ping ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
      await interaction.reply('🏓 Pong!');
      return;
    }

    // === /paypal ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'paypal') {
      const amount = interaction.options.getNumber('betrag');
      if (!amount || amount <= 0)
        return interaction.reply({ content: '⚠️ Bitte gib einen gültigen Betrag ein!', flags: 64 });

      const paypalLink = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;
      const embed = new EmbedBuilder()
        .setTitle('💰 PayPal Zahlung')
        .setDescription(`Klicke unten, um **${amount}€** zu zahlen.`)
        .setColor('#0099ff')
        .setTimestamp();

      const button = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(paypalLink);

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      return;
    }

    // === /creator add ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'creator') {
      const sub = interaction.options.getSubcommand();

      // ADD
      if (sub === 'add') {
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
          .setLabel('Twitch-Link')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const youtubeInput = new TextInputBuilder()
          .setCustomId('youtube')
          .setLabel('YouTube-Link (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const tiktokInput = new TextInputBuilder()
          .setCustomId('tiktok')
          .setLabel('TikTok-Link (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const codeInput = new TextInputBuilder()
          .setCustomId('code')
          .setLabel('Creator-Code (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(creatorIdInput),
          new ActionRowBuilder().addComponents(twitchInput),
          new ActionRowBuilder().addComponents(youtubeInput),
          new ActionRowBuilder().addComponents(tiktokInput),
          new ActionRowBuilder().addComponents(codeInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // LIST
      if (sub === 'list') {
        const path = './data/creators.json';
        if (!fs.existsSync(path))
          return interaction.reply({ content: '❌ Es wurden noch keine Creator gespeichert.', flags: 64 });

        const list = JSON.parse(fs.readFileSync(path, 'utf8'));
        if (!list.length)
          return interaction.reply({ content: '❌ Keine Creator vorhanden.', flags: 64 });

        const embed = new EmbedBuilder()
          .setTitle('🌟 Creator Übersicht')
          .setColor('#9b5de5')
          .setTimestamp();

        for (const c of list) {
          let value = '';
          if (c.twitch) value += `[Twitch](${c.twitch}) `;
          if (c.youtube) value += `[YouTube](${c.youtube}) `;
          if (c.tiktok) value += `[TikTok](${c.tiktok}) `;
          if (c.code) value += `\n🎟️ **Code:** ${c.code}`;
          embed.addFields({ name: c.title || 'Unbekannter Creator', value: value || 'Keine Links angegeben' });
        }

        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }
    }

    // === Modal Submit: Creator Add ===
    if (interaction.isModalSubmit() && interaction.customId === 'creatorAddModal') {
      const title = interaction.fields.getTextInputValue('title');
      const creatorId = interaction.fields.getTextInputValue('creatorId');
      const twitch = interaction.fields.getTextInputValue('twitch');
      const youtube = interaction.fields.getTextInputValue('youtube')?.trim() || '';
      const tiktok = interaction.fields.getTextInputValue('tiktok')?.trim() || '';
      const code = interaction.fields.getTextInputValue('code')?.trim() || '';

      const guild = interaction.guild;
      if (!guild) return interaction.reply({ content: '❌ Guild nicht gefunden!', flags: 64 });

      const roleName = process.env.CREATOR_ROLE_NAME || 'Creator';
      const role = guild.roles.cache.find(r => r.name === roleName);
      const member = await guild.members.fetch(creatorId).catch(() => null);
      if (member && role) await member.roles.add(role).catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('#9b5de5')
        .setTimestamp();

      if (twitch) embed.addFields({ name: 'Twitch', value: twitch });
      if (youtube) embed.addFields({ name: 'YouTube', value: youtube });
      if (tiktok) embed.addFields({ name: 'TikTok', value: tiktok });
      if (code) embed.addFields({ name: 'Creator-Code', value: code });

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('editCreator').setLabel('Bearbeiten').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('deleteCreator').setLabel('Löschen').setStyle(ButtonStyle.Danger)
      );

      const socialRow = new ActionRowBuilder();
      if (twitch) socialRow.addComponents(new ButtonBuilder().setLabel('Twitch').setStyle(ButtonStyle.Link).setURL(twitch));
      if (youtube) socialRow.addComponents(new ButtonBuilder().setLabel('YouTube').setStyle(ButtonStyle.Link).setURL(youtube));
      if (tiktok) socialRow.addComponents(new ButtonBuilder().setLabel('TikTok').setStyle(ButtonStyle.Link).setURL(tiktok));

      const msg = await interaction.reply({ embeds: [embed], components: [adminRow, socialRow], fetchReply: true });

      fs.mkdirSync('./data', { recursive: true });
      const path = './data/creators.json';
      const list = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
      list.push({ title, creatorId, twitch, youtube, tiktok, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(path, JSON.stringify(list, null, 2));

      await interaction.followUp({ content: '✅ Creator erstellt!', flags: 64 });
      return;
    }

    // === Creator bearbeiten ===
    if (interaction.isButton() && interaction.customId === 'editCreator') {
      const path = './data/creators.json';
      if (!fs.existsSync(path)) return interaction.reply({ content: '❌ Keine Creator gespeichert.', flags: 64 });
      const list = JSON.parse(fs.readFileSync(path, 'utf8'));
      const entry = list.find(e => e.messageId === interaction.message.id);
      if (!entry) return interaction.reply({ content: '❌ Creator nicht gefunden.', flags: 64 });

      const modal = new ModalBuilder().setCustomId(`editCreatorModal_${entry.messageId}`).setTitle('Creator bearbeiten');

      const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setValue(entry.title).setRequired(true);
      const twitchInput = new TextInputBuilder().setCustomId('twitch').setLabel('Twitch-Link').setStyle(TextInputStyle.Short).setValue(entry.twitch).setRequired(true);
      const youtubeInput = new TextInputBuilder().setCustomId('youtube').setLabel('YouTube-Link (optional)').setStyle(TextInputStyle.Short).setValue(entry.youtube || '').setRequired(false);
      const tiktokInput = new TextInputBuilder().setCustomId('tiktok').setLabel('TikTok-Link (optional)').setStyle(TextInputStyle.Short).setValue(entry.tiktok || '').setRequired(false);
      const codeInput = new TextInputBuilder().setCustomId('code').setLabel('Creator-Code (optional)').setStyle(TextInputStyle.Short).setValue(entry.code || '').setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(twitchInput),
        new ActionRowBuilder().addComponents(youtubeInput),
        new ActionRowBuilder().addComponents(tiktokInput),
        new ActionRowBuilder().addComponents(codeInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // === Modal Submit (Edit) ===
    if (interaction.isModalSubmit() && interaction.customId.startsWith('editCreatorModal_')) {
      const messageId = interaction.customId.split('editCreatorModal_')[1];
      const path = './data/creators.json';
      if (!fs.existsSync(path)) return interaction.reply({ content: '❌ Datei fehlt.', flags: 64 });
      const list = JSON.parse(fs.readFileSync(path, 'utf8'));
      const entry = list.find(e => e.messageId === messageId);
      if (!entry) return interaction.reply({ content: '❌ Creator nicht gefunden.', flags: 64 });

      entry.title = interaction.fields.getTextInputValue('title');
      entry.twitch = interaction.fields.getTextInputValue('twitch');
      entry.youtube = interaction.fields.getTextInputValue('youtube')?.trim() || '';
      entry.tiktok = interaction.fields.getTextInputValue('tiktok')?.trim() || '';
      entry.code = interaction.fields.getTextInputValue('code')?.trim() || '';
      fs.writeFileSync(path, JSON.stringify(list, null, 2));

      const embed = new EmbedBuilder().setTitle(entry.title).setColor('#9b5de5').setTimestamp();
      if (entry.twitch) embed.addFields({ name: 'Twitch', value: entry.twitch });
      if (entry.youtube) embed.addFields({ name: 'YouTube', value: entry.youtube });
      if (entry.tiktok) embed.addFields({ name: 'TikTok', value: entry.tiktok });
      if (entry.code) embed.addFields({ name: 'Creator-Code', value: entry.code });

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('editCreator').setLabel('Bearbeiten').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('deleteCreator').setLabel('Löschen').setStyle(ButtonStyle.Danger)
      );

      const socialRow = new ActionRowBuilder();
      if (entry.twitch) socialRow.addComponents(new ButtonBuilder().setLabel('Twitch').setStyle(ButtonStyle.Link).setURL(entry.twitch));
      if (entry.youtube) socialRow.addComponents(new ButtonBuilder().setLabel('YouTube').setStyle(ButtonStyle.Link).setURL(entry.youtube));
      if (entry.tiktok) socialRow.addComponents(new ButtonBuilder().setLabel('TikTok').setStyle(ButtonStyle.Link).setURL(entry.tiktok));

      const msg = await interaction.channel.messages.fetch(messageId);
      await msg.edit({ embeds: [embed], components: [adminRow, socialRow] });
      await interaction.reply({ content: '✅ Creator aktualisiert!', flags: 64 });
      return;
    }

    // === Creator löschen ===
    if (interaction.isButton() && interaction.customId === 'deleteCreator') {
      const path = './data/creators.json';
      if (!fs.existsSync(path)) return interaction.reply({ content: '❌ Keine Creator gespeichert.', flags: 64 });
      const list = JSON.parse(fs.readFileSync(path, 'utf8'));
      const newList = list.filter(e => e.messageId !== interaction.message.id);
      fs.writeFileSync(path, JSON.stringify(newList, null, 2));
      await interaction.message.delete().catch(() => {});
      await interaction.reply({ content: '🗑️ Creator gelöscht!', flags: 64 });
      return;
    }

  } catch (err) {
    console.error('Fehler in Interaction:', err);
    if (!interaction.replied)
      await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten.', flags: 64 });
  }
});

// === Login ===
client.login(process.env.DISCORD_TOKEN);









