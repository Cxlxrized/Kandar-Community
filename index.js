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

// ===================== Hilfen & State =====================
function parseDuration(input) {
  // akzeptiert "1d", "2h", "30m" oder Sekunden als Zahl
  if (!input) return 0;
  const s = String(input).trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
  const m = s.match(/^(\d+)\s*([dhm])$/i);
  if (!m) return 0;
  const val = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'm') return val * 60 * 1000;
  return 0;
}

const ordersMap = new Map(); // userId -> { channelId, msgId, items: [] }
const giveawayState = new Map(); // messageId -> { entrants:Set<userId>, winners:number, prize, timeoutId }

// ===================== Commands definieren =====================
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Antwortet mit Pong!'),

  new SlashCommandBuilder().setName('serverstats').setDescription('Zeigt Server-Statistiken an'),

  new SlashCommandBuilder()
    .setName('paypal')
    .setDescription('Erstellt einen PayPal-Zahlungslink')
    .addNumberOption(o => o.setName('betrag').setDescription('Betrag in Euro').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticketmsg')
    .setDescription('Sendet das Ticket-Auswahl-Embed'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Sendet das Regelwerk + Verify-Button in den konfigurierten Channel'),

  new SlashCommandBuilder()
    .setName('order')
    .setDescription('Bestellübersicht starten (nur bestimmte Rollen)')
    .addStringOption(o => o.setName('artikel').setDescription('Erster Artikel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('finish')
    .setDescription('Kauf abschließen: Kunde erhält Rolle & Feedback geben lassen (nur bestimmte Rollen)')
    .addUserOption(o => o.setName('kunde').setDescription('Kunde, der die Rolle und Feedback erhält').setRequired(true)),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway verwalten')
    .addSubcommand(sc =>
      sc.setName('start')
        .setDescription('Giveaway starten')
        .addStringOption(o => o.setName('dauer').setDescription('z.B. 1d, 2h, 30m oder Sekunden').setRequired(true))
        .addIntegerOption(o => o.setName('gewinner').setDescription('Anzahl Gewinner').setRequired(true))
        .addStringOption(o => o.setName('preis').setDescription('Preis / Gewinn').setRequired(true))
        .addChannelOption(o => o.setName('kanal').setDescription('Kanal für das Giveaway').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('delete')
        .setDescription('Giveaway löschen')
        .addStringOption(o => o.setName('message_id').setDescription('Nachrichten-ID des Giveaways').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('reroll')
        .setDescription('Gewinner neu ziehen')
        .addStringOption(o => o.setName('message_id').setDescription('Nachrichten-ID des Giveaways').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Löscht viele Nachrichten im aktuellen Channel (nur bestimmte Rollen)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
].map(c => c.toJSON());

// === Commands registrieren ===
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('🔄 Commands werden registriert/überschrieben...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registriert!');
  } catch (err) {
    console.error('❌ Fehler beim Registrieren der Commands:', err);
  }
})();

// ===================== Helper: Serverstats =====================
async function createOrUpdateStatsChannels(guild) {
  try {
    let memberChannel = guild.channels.cache.find(c => c.name.includes('👥 Mitglieder'));
    if (!memberChannel) {
      await guild.channels.create({
        name: `👥 Mitglieder: ${guild.memberCount}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone, deny: ['Connect'] }]
      });
    } else {
      await memberChannel.setName(`👥 Mitglieder: ${guild.memberCount}`);
    }
    console.log('✅ Serverstats aktualisiert');
  } catch (error) {
    console.error('Fehler bei Serverstats:', error);
  }
}

// ===================== Bot Ready =====================
client.once('ready', async () => {
  console.log(`🤖 Bot ist online als ${client.user.tag}`);
  client.guilds.cache.forEach(guild => createOrUpdateStatsChannels(guild));
});

// ===================== Interactions =====================
client.on('interactionCreate', async interaction => {
  try {
    // --- PING ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
      await interaction.reply('🏓 Pong!');
      return;
    }

    // --- SERVERSTATS (nur zum Ausführen erneuter Aktualisierung, optional) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'serverstats') {
      await createOrUpdateStatsChannels(interaction.guild);
      await interaction.reply({ content: '✅ Serverstats aktualisiert!', flags: 64 });
      return;
    }

    // --- PAYPAL COMMAND ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'paypal') {
      try {
        const allowedRoles = process.env.PAYPAL_ROLES ? process.env.PAYPAL_ROLES.split(',') : [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);
        if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', flags: 64 });
        }

        const amount = interaction.options.getNumber('betrag');
        if (!amount || amount <= 0) {
          return interaction.reply({ content: '⚠️ Bitte gib einen gültigen Betrag ein!', flags: 64 });
        }

        const paypalLink = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;

        const embed = new EmbedBuilder()
          .setTitle('💰 PayPal Zahlung')
          .setDescription(`Klicke auf den Button unten, um **${amount}€** zu zahlen.`)
          .setColor('#0099ff')
          .setImage('https://cdn.discordapp.com/attachments/1310294304280719441/1310313363142371368/paypal-banner.png')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        const button = new ButtonBuilder()
          .setLabel(`Jetzt ${amount}€ zahlen`)
          .setStyle(ButtonStyle.Link)
          .setURL(paypalLink);

        const row = new ActionRowBuilder().addComponents(button);
        await interaction.reply({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('PayPal Command Error:', err);
        if (!interaction.replied)
          await interaction.reply({ content: '❌ Fehler im PayPal Command!', flags: 64 });
      }
      return;
    }

    // --- /TICKETMSG ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticketmsg') {
      const allowedRoles = process.env.TICKETMSG_ROLES ? process.env.TICKETMSG_ROLES.split(',') : [];
      const memberRoles = interaction.member.roles.cache.map(r => r.id);
      if (!allowedRoles.some(r => memberRoles.includes(r))) {
        await interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', flags: 64 });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Erstelle dein Ticket')
        .setDescription(
          `Bitte wähle die Ticket-Art unten aus:\n\n` +
          `💰 **Shop** – Für Käufe\n` +
          `✍️ **Kandar Bewerbung** – Bewerbung für Kandar\n` +
          `🎨 **Designer Bewerbung** – Bewerbung für Designer\n` +
          `✂️ **Cutter Bewerbung** – Bewerbung für Cutter\n` +
          `🛠️ **Support** – Allgemeine Hilfe`
        )
        .setColor('#00FF00')
        .setImage('https://files.fm/u/gbvzj5yexg')
        .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

      const dropdown = new StringSelectMenuBuilder()
        .setCustomId('ticketSelect')
        .setPlaceholder('Wähle eine Ticket-Art')
        .addOptions([
          { label: 'Shop', value: 'shop', emoji: '💰', description: 'Ticket für Käufe' },
          { label: 'Kandar Bewerbung', value: 'kandar', emoji: '✍️', description: 'Bewerbung für Kandar' },
          { label: 'Designer Bewerbung', value: 'designer', emoji: '🎨', description: 'Bewerbung für Designer' },
          { label: 'Cutter Bewerbung', value: 'cutter', emoji: '✂️', description: 'Bewerbung für Cutter' },
          { label: 'Support', value: 'support', emoji: '🛠️', description: 'Allgemeine Hilfe / Support' },
        ]);

      const row = new ActionRowBuilder().addComponents(dropdown);
      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    // --- Dropdown Auswahl Ticket ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticketSelect') {
      const choice = interaction.values[0];
      const guild = interaction.guild;

      let categoryName, channelName;
      switch (choice) {
        case 'shop': categoryName = 'Shop Tickets'; channelName = `💰-${interaction.user.username}`; break;
        case 'kandar': categoryName = 'Kandar Bewerbungen'; channelName = `✍️-${interaction.user.username}`; break;
        case 'designer': categoryName = 'Designer Bewerbungen'; channelName = `🎨-${interaction.user.username}`; break;
        case 'cutter': categoryName = 'Cutter Bewerbungen'; channelName = `✂️-${interaction.user.username}`; break;
        case 'support': categoryName = 'Support Tickets'; channelName = `🛠️-${interaction.user.username}`; break;
        default: return;
      }

      let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
      if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

      const ticketChannel = await guild.channels.create({
        name: channelName.toLowerCase(),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        ],
      });

      const closeButton = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Ticket schließen')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(closeButton);

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 ${choice === 'support' ? 'Support' : choice.charAt(0).toUpperCase() + choice.slice(1)} Ticket`)
        .setDescription(`Hallo ${interaction.user}, bitte schildere dein Anliegen unten.`)
        .setColor('#00FF00')
        .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [row] });
      await interaction.reply({ content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}`, flags: 64 });
      return;
    }

    // --- Ticket schließen (Button) ---
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close_ticket').setLabel('✅ Schließen').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_close_ticket').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ content: 'Bist du sicher, dass du dieses Ticket schließen möchtest?', components: [confirmRow] });
      return;
    }

    // --- Ticket-Schließung abbrechen ---
    if (interaction.isButton() && interaction.customId === 'cancel_close_ticket') {
      await interaction.update({ content: '❌ Ticket-Schließung abgebrochen!', components: [] });
      return;
    }

    // --- Ticket-Schließung bestätigen + Transkript ---
    if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
      await interaction.reply({ content: '📦 Erstelle Transkript und schließe das Ticket...' });
      const logChannelId = process.env.TICKET_LOG_CHANNEL_ID;
      const logChannel = interaction.guild.channels.cache.get(logChannelId);

      try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const sortedMessages = Array.from(messages.values()).reverse();

        let transcript = `--- 📜 Ticket-Transkript ---\nServer: ${interaction.guild.name}\nChannel: ${interaction.channel.name}\nGeschlossen von: ${interaction.user.tag}\nZeit: ${new Date().toLocaleString()}\n\n`;
        for (const msg of sortedMessages) {
          const time = new Date(msg.createdTimestamp).toLocaleString();
          const author = msg.author?.tag || 'Unbekannt';
          const content = msg.content || '[Anhang/Nachricht leer]';
          transcript += `[${time}] ${author}: ${content}\n`;
        }

        const path = `./transcript_${interaction.channel.id}.txt`;
        fs.writeFileSync(path, transcript, 'utf8');

        const embed = new EmbedBuilder()
          .setTitle('📁 Ticket geschlossen')
          .setDescription(`Das Ticket **${interaction.channel.name}** wurde geschlossen und archiviert.`)
          .addFields(
            { name: 'Geschlossen von', value: `${interaction.user}`, inline: true },
            { name: 'Ticket-ID', value: `\`${interaction.channel.id}\``, inline: true }
          )
          .setColor('#FF0000')
          .setTimestamp()
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

        if (logChannel) await logChannel.send({ embeds: [embed], files: [path] });

        await interaction.followUp({ content: '✅ Ticket wird in **5 Sekunden** gelöscht...' });
        setTimeout(async () => {
          try { fs.unlinkSync(path); } catch {}
          await interaction.channel.delete().catch(() => {});
        }, 5000);
      } catch (err) {
        console.error('Fehler beim Erstellen des Transkripts:', err);
        await interaction.followUp({ content: '❌ Fehler beim Erstellen des Transkripts!' });
      }
      return;
    }

    // --- VERIFY (Regelwerk & Button) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
      const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
      const verifyRoleId = process.env.VERIFY_ROLE_ID;
      const channel = interaction.guild.channels.cache.get(verifyChannelId);
      if (!channel || !verifyRoleId) {
        return interaction.reply({ content: '❌ VERIFY_CHANNEL_ID oder VERIFY_ROLE_ID fehlt/ungültig.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setTitle('📜 Regelwerk')
        .setDescription(
          `§ 1: Umgang\nEin freundlicher und respektvoller Umgang ist jederzeit Pflicht!\n` +
          `§ 2: Anweisungen\nDen Anweisungen von Teammitgliedern ist stets Folge zu leisten!\n` +
          `§ 3: Pingen\nDas grundlose Taggen/Pingen/Markieren von Nutzern & Benutzerrängen ist untersagt!\n` +
          `§ 4: Leaking\nDas Teilen/Leaken von personenbezogenen Daten ist verboten!\n` +
          `§ 5: Spam\nSpamming jeglicher Form ist in sämtlichen Textchannels verboten!\n` +
          `§ 6: Channels\nDas Senden von Sachen in die dafür nicht vorgesehenen Channel ist verboten!\n` +
          `§ 7: Das letzte Wort\nTeammitglieder haben das letzte Wort!\n` +
          `§ 8: Beleidigungen\nExtremes Beleidigen im Chat ist Strengstens verboten!\n` +
          `§ 10: Werbung\nWerbung für andere Discord-Server ist in allen Text- und Voicechannels, sowie auch über DM verboten!\n` +
          `§ 11: NSFW-Inhalte\nDas Verbreiten von Videos und Bildern, welche Tierquälerei und Blutinhalte zeigen, ist verboten!\n` +
          `§ 12: Drohung und Erpressung\nDas Drohen und Erpressen von Usern, beispielsweise mit einem Leak ist verboten!\n` +
          `§ 13: Bots und Raids\nDas Verwenden von Bot-Accounts und Durchführen von Raids ist verboten!\n` +
          `§ 14: Discord Rules\nAuf diesem Server gelten auch die allgemeinen Discord ToS sowie Discord Community-Richtlinien!`
        )
        .setColor('#00FF00')
        .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

      const button = new ButtonBuilder()
        .setCustomId('verify_role')
        .setLabel('✅ Verifizieren')
        .setStyle(ButtonStyle.Success);

      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
      await interaction.reply({ content: '✅ Verify-Embed gesendet!', flags: 64 });
      return;
    }

    // --- Verify Button: Rolle geben ---
    if (interaction.isButton() && interaction.customId === 'verify_role') {
      const roleId = process.env.VERIFY_ROLE_ID;
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '❌ Verify-Rolle nicht gefunden!', flags: 64 });
      await interaction.member.roles.add(role).catch(() => {});
      await interaction.reply({ content: '✅ Du wurdest verifiziert!', flags: 64 });
      return;
    }

    // --- ORDER (Bestellübersicht) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'order') {
      const allowedRoles = process.env.ORDER_ROLES ? process.env.ORDER_ROLES.split(',') : [];
      const memberRoles = interaction.member.roles.cache.map(r => r.id);
      if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
        return interaction.reply({ content: '❌ Du hast keine Berechtigung für /order.', flags: 64 });
      }

      const item = interaction.options.getString('artikel');
      const userId = interaction.user.id;

      if (!ordersMap.has(userId)) ordersMap.set(userId, { channelId: interaction.channel.id, msgId: null, items: [] });
      const entry = ordersMap.get(userId);
      entry.items.push(item);

      const embed = new EmbedBuilder()
        .setTitle(`🛒 Bestellübersicht von ${interaction.user.username}`)
        .setDescription(entry.items.map((i, idx) => `**${idx + 1}.** ${i}`).join('\n'))
        .setColor('#00A8FF')
        .setFooter({ text: 'Verwende das Menü unten um fortzufahren!' });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('order-menu')
        .setPlaceholder('Was möchtest du tun?')
        .addOptions(
          { label: 'Artikel hinzufügen', value: 'add-item', description: 'Weiteren Artikel hinzufügen' },
          { label: 'Bestellung abschließen', value: 'finish-order', description: 'Bestellung beenden' }
        );

      const msg = await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], fetchReply: true });
      entry.msgId = msg.id;
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'order-menu') {
      const entry = ordersMap.get(interaction.user.id);
      if (!entry) return interaction.reply({ content: '❌ Keine Bestellung gefunden!', flags: 64 });

      if (interaction.values[0] === 'add-item') {
        const modal = new ModalBuilder().setCustomId('order-modal').setTitle('Artikel hinzufügen');
        const input = new TextInputBuilder().setCustomId('order-item').setLabel('Neuer Artikel').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.values[0] === 'finish-order') {
        ordersMap.delete(interaction.user.id);

        // optional: Customer Rolle geben
        const customerRoleId = process.env.CUSTOMER_ROLE_ID;
        if (customerRoleId) {
          const role = interaction.guild.roles.cache.get(customerRoleId);
          if (role) await interaction.member.roles.add(role).catch(() => {});
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Bestellung abgeschlossen')
          .setDescription('Danke! Deine Bestellung wurde erfolgreich übermittelt ✅')
          .setColor('#00FF6E');

        await interaction.update({ embeds: [embed], components: [] });
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'order-modal') {
      const entry = ordersMap.get(interaction.user.id);
      if (!entry) return interaction.reply({ content: '❌ Keine Bestellung gefunden!', flags: 64 });

      const item = interaction.fields.getTextInputValue('order-item');
      entry.items.push(item);

      const embed = new EmbedBuilder()
        .setTitle(`🛒 Bestellübersicht von ${interaction.user.username}`)
        .setDescription(entry.items.map((i, idx) => `**${idx + 1}.** ${i}`).join('\n'))
        .setColor('#00A8FF');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('order-menu')
        .addOptions(
          { label: 'Artikel hinzufügen', value: 'add-item' },
          { label: 'Bestellung abschließen', value: 'finish-order' }
        );

      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }

    // --- FINISH (Kunde + Feedback) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'finish') {
      const allowedRoles = process.env.FINISH_ROLES ? process.env.FINISH_ROLES.split(',') : [];
      const memberRoles = interaction.member.roles.cache.map(r => r.id);
      if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
        return interaction.reply({ content: '❌ Du hast keine Berechtigung für /finish.', flags: 64 });
      }

      const kunde = interaction.options.getUser('kunde');
      if (!kunde) return interaction.reply({ content: '❌ Kunde fehlt!', flags: 64 });

      const embed = new EmbedBuilder()
        .setTitle('🧾 Bestellung abschließen')
        .setDescription(`${kunde}, bitte gib dein Feedback ab. Nach dem Feedback erhältst du ggf. deine Kundenrolle.`)
        .setColor('#00B894')
        .setTimestamp();

      const btn = new ButtonBuilder().setCustomId(`finish_feedback_${kunde.id}`).setLabel('⭐ Feedback geben').setStyle(ButtonStyle.Primary);
      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('finish_feedback_')) {
      const targetId = interaction.customId.split('finish_feedback_')[1];
      if (interaction.user.id !== targetId) {
        return interaction.reply({ content: '❌ Dieses Feedback ist nicht für dich vorgesehen.', flags: 64 });
      }

      const modal = new ModalBuilder().setCustomId(`finish_feedback_modal_${targetId}`).setTitle('Feedback abgeben');
      const ti = new TextInputBuilder().setCustomId('fb_text').setLabel('Dein Feedback').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(ti));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('finish_feedback_modal_')) {
      const targetId = interaction.customId.split('finish_feedback_modal_')[1];
      const feedbackText = interaction.fields.getTextInputValue('fb_text');

      // Kunde Rolle zuweisen (optional)
      const customerRoleId = process.env.CUSTOMER_ROLE_ID;
      if (customerRoleId) {
        const role = interaction.guild.roles.cache.get(customerRoleId);
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (role && member) await member.roles.add(role).catch(() => {});
      }

      // Log optional
      const logChannelId = process.env.TICKET_LOG_CHANNEL_ID;
      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('📝 Feedback erhalten')
          .addFields(
            { name: 'Von', value: `<@${targetId}>`, inline: true },
            { name: 'Feedback', value: feedbackText || '-' }
          )
          .setColor('#FFD166')
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }

      // ursprüngliche Nachricht (mit Button) löschen
      try {
        await interaction.message.delete().catch(() => {});
      } catch {}

      await interaction.reply({ content: '✅ Danke für dein Feedback!', flags: 64 });
      return;
    }

    // --- GIVEAWAY ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'start') {
        const durStr = interaction.options.getString('dauer');
        const ms = parseDuration(durStr);
        if (!ms || ms < 1000) return interaction.reply({ content: '❌ Ungültige Dauer. Nutze z.B. 1d, 2h, 30m oder Sekunden.', flags: 64 });

        const winners = interaction.options.getInteger('gewinner') || 1;
        const prize = interaction.options.getString('preis') || 'Gewinn';
        const channel = interaction.options.getChannel('kanal');
        if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content: '❌ Bitte Textkanal angeben.', flags: 64 });

        const endTs = Date.now() + ms;
        const embed = new EmbedBuilder()
          .setTitle('🎉 Giveaway')
          .setDescription(`**Preis:** ${prize}\n**Gewinner:** ${winners}\n**Ende:** <t:${Math.floor(endTs/1000)}:R>\n\nKlicke auf **Teilnehmen**!`)
          .setColor('#F39C12')
          .setTimestamp();

        const btn = new ButtonBuilder().setCustomId('gw_enter').setLabel('🎉 Teilnehmen').setStyle(ButtonStyle.Success);
        const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });

        giveawayState.set(msg.id, { entrants: new Set(), winners, prize, timeoutId: null });

        const timeoutId = setTimeout(async () => {
          const state = giveawayState.get(msg.id);
          if (!state) return;
          const entrants = Array.from(state.entrants);
          if (entrants.length === 0) {
            await msg.reply('❌ Keine Teilnehmer. Giveaway beendet.');
          } else {
            const shuffled = entrants.sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, state.winners);
            await msg.reply(`🎉 Gewinner: ${selected.map(id => `<@${id}>`).join(', ')} — Preis: **${state.prize}**`);
          }
          giveawayState.delete(msg.id);
        }, ms);
        giveawayState.get(msg.id).timeoutId = timeoutId;

        await interaction.reply({ content: `✅ Giveaway gestartet in ${channel}!`, flags: 64 });
        return;
      }

      if (sub === 'delete') {
        const messageId = interaction.options.getString('message_id');
        const state = giveawayState.get(messageId);
        if (state && state.timeoutId) clearTimeout(state.timeoutId);
        giveawayState.delete(messageId);
        await interaction.reply({ content: '🗑️ Giveaway (falls aktiv) gestoppt (nur In-Memory).', flags: 64 });
        return;
      }

      if (sub === 'reroll') {
        const messageId = interaction.options.getString('message_id');
        const state = giveawayState.get(messageId);
        if (!state) return interaction.reply({ content: '❌ Kein aktives Giveaway mit dieser Message-ID (oder Bot wurde neu gestartet).', flags: 64 });
        const entrants = Array.from(state.entrants);
        if (entrants.length === 0) return interaction.reply({ content: '❌ Keine Teilnehmer vorhanden.', flags: 64 });
        const shuffled = entrants.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, state.winners);
        await interaction.reply({ content: `🎲 Reroll Gewinner: ${selected.map(id => `<@${id}>`).join(', ')}`, flags: 64 });
        return;
      }
    }

    // Giveaway Button Teilnahme
    if (interaction.isButton() && interaction.customId === 'gw_enter') {
      const msgId = interaction.message.id;
      const state = giveawayState.get(msgId);
      if (!state) return interaction.reply({ content: '❌ Dieses Giveaway ist nicht mehr aktiv.', flags: 64 });
      state.entrants.add(interaction.user.id);
      await interaction.reply({ content: '✅ Teilnahme registriert. Viel Glück! 🍀', flags: 64 });
      return;
    }

    // --- NUKE (Bestätigung per Buttons) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'nuke') {
      const allowedRoles = process.env.NUKE_ROLES ? process.env.NUKE_ROLES.split(',') : [];
      const memberRoles = interaction.member.roles.cache.map(r => r.id);
      if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
        return interaction.reply({ content: '❌ Du hast keine Berechtigung für /nuke.', flags: 64 });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('nuke_confirm').setLabel('✅ Bestätigen').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('nuke_cancel').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: '⚠️ Bist du sicher, dass du diesen Channel nuken willst?', components: [row], flags: 64 });
      return;
    }

    if (interaction.isButton() && (interaction.customId === 'nuke_confirm' || interaction.customId === 'nuke_cancel')) {
      if (interaction.customId === 'nuke_cancel') {
        return interaction.update({ content: '❌ Nuke abgebrochen.', components: [] });
      }
      // confirm
      await interaction.update({ content: '⏳ Nuking... bitte warten.', components: [] });
      const channel = interaction.channel;
      try {
        let fetched;
        do {
          fetched = await channel.messages.fetch({ limit: 100 });
          if (fetched.size > 0) await channel.bulkDelete(fetched, true);
          await new Promise(res => setTimeout(res, 400));
        } while (fetched.size >= 2);
        await channel.send(`✅ Channel wurde von **${interaction.user.tag}** geleert.`);
      } catch (e) {
        console.error('Nuke Error:', e);
        try { await channel.send('❌ Fehler beim Nuking. (Hinweis: Nachrichten >14 Tage können nicht gelöscht werden)'); } catch {}
      }
      return;
    }

  } catch (error) {
    console.error('Fehler im Interaction Listener:', error);
    try {
      if (interaction.replied || interaction.deferred)
        await interaction.followUp({ content: '❌ Es ist ein Fehler aufgetreten!', flags: 64 });
      else
        await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', flags: 64 });
    } catch {}
  }
});

// === Login ===
client.login(process.env.DISCORD_TOKEN);








