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

// === Command Definitionen ===
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Antwortet mit Pong!'),
  new SlashCommandBuilder().setName('paypal').setDescription('Erstellt einen PayPal-Link').addNumberOption(o => o.setName('betrag').setDescription('Betrag in Euro').setRequired(true)),
  new SlashCommandBuilder().setName('creator').setDescription('Creator Verwaltung')
    .addSubcommand(sc => sc.setName('add').setDescription('Fügt einen Creator hinzu')),
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

// === Interaction Handler ===
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

    // === /creator add (Modal anzeigen) ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'creator') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') {
        const modal = new ModalBuilder()
          .setCustomId('creatorAddModal')
          .setTitle('Creator hinzufügen');

        const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Titel des Embeds').setStyle(TextInputStyle.Short).setRequired(true);
        const creatorIdInput = new TextInputBuilder().setCustomId('creatorId').setLabel('Discord-ID des Creators').setStyle(TextInputStyle.Short).setRequired(true);
        const twitchInput = new TextInputBuilder().setCustomId('twitch').setLabel('Twitch-Link').setStyle(TextInputStyle.Short).setRequired(true);
        const youtubeInput = new TextInputBuilder().setCustomId('youtube').setLabel('YouTube-Link (optional)').setStyle(TextInputStyle.Short).setRequired(false);
        const codeInput = new TextInputBuilder().setCustomId('code').setLabel('Creator-Code (optional)').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(creatorIdInput),
          new ActionRowBuilder().addComponents(twitchInput),
          new ActionRowBuilder().addComponents(youtubeInput),
          new ActionRowBuilder().addComponents(codeInput)
        );

        await interaction.showModal(modal);
        return;
      }
    }

    // === Modal Submit (Creator Add) ===
    if (interaction.isModalSubmit() && interaction.customId === 'creatorAddModal') {
      const title = interaction.fields.getTextInputValue('title');
      const creatorId = interaction.fields.getTextInputValue('creatorId');
      const twitch = interaction.fields.getTextInputValue('twitch');
      const youtube = interaction.fields.getTextInputValue('youtube') || '';
      const code = interaction.fields.getTextInputValue('code') || '';
      const tiktok = 'n/a';
      const instagram = 'n/a';

      const guild = interaction.guild;
      if (!guild) return interaction.reply({ content: '❌ Guild nicht gefunden!', flags: 64 });

      const roleName = process.env.CREATOR_ROLE_NAME || 'Creator';
      const role = guild.roles.cache.find(r => r.name === roleName);
      const member = await guild.members.fetch(creatorId).catch(() => null);
      if (member && role) await member.roles.add(role).catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('#9b5de5')
        .addFields(
          { name: 'Twitch', value: twitch },
          { name: 'YouTube', value: youtube || 'n/a' },
          { name: 'Creator-Code', value: code || 'n/a' }
        )
        .setTimestamp();

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('editCreator').setLabel('Bearbeiten').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('deleteCreator').setLabel('Löschen').setStyle(ButtonStyle.Danger)
      );

      const socialRow = new ActionRowBuilder();
      if (twitch && twitch !== 'n/a') socialRow.addComponents(new ButtonBuilder().setLabel('Twitch').setStyle(ButtonStyle.Link).setURL(twitch));
      if (youtube && youtube !== 'n/a') socialRow.addComponents(new ButtonBuilder().setLabel('YouTube').setStyle(ButtonStyle.Link).setURL(youtube));

      const message = await interaction.reply({ embeds: [embed], components: [adminRow, socialRow], fetchReply: true });

      fs.mkdirSync('./data', { recursive: true });
      const path = './data/creators.json';
      const list = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
      list.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: message.id, channelId: message.channel.id });
      fs.writeFileSync(path, JSON.stringify(list, null, 2));

      await interaction.followUp({ content: '✅ Creator erstellt und Rolle vergeben!', flags: 64 });
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

      const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setValue(entry.title);
      const twitchInput = new TextInputBuilder().setCustomId('twitch').setLabel('Twitch-Link').setStyle(TextInputStyle.Short).setValue(entry.twitch);
      const youtubeInput = new TextInputBuilder().setCustomId('youtube').setLabel('YouTube-Link (optional)').setStyle(TextInputStyle.Short).setValue(entry.youtube || '');
      const codeInput = new TextInputBuilder().setCustomId('code').setLabel('Creator-Code (optional)').setStyle(TextInputStyle.Short).setValue(entry.code || '');
      const tiktokInput = new TextInputBuilder().setCustomId('tiktok').setLabel('TikTok-Link (optional)').setStyle(TextInputStyle.Short).setValue(entry.tiktok || '');

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(twitchInput),
        new ActionRowBuilder().addComponents(youtubeInput),
        new ActionRowBuilder().addComponents(codeInput),
        new ActionRowBuilder().addComponents(tiktokInput)
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
      entry.youtube = interaction.fields.getTextInputValue('youtube') || '';
      entry.code = interaction.fields.getTextInputValue('code') || '';
      entry.tiktok = interaction.fields.getTextInputValue('tiktok') || '';
      fs.writeFileSync(path, JSON.stringify(list, null, 2));

      const embed = new EmbedBuilder()
        .setTitle(entry.title)
        .setColor('#9b5de5')
        .addFields(
          { name: 'Twitch', value: entry.twitch },
          { name: 'YouTube', value: entry.youtube || 'n/a' },
          { name: 'Creator-Code', value: entry.code || 'n/a' },
          { name: 'TikTok', value: entry.tiktok || 'n/a' }
        )
        .setTimestamp();

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

// === Bot Login ===
client.login(process.env.DISCORD_TOKEN);








