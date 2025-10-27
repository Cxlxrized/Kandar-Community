// index.js
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
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   Branding & Constants
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND_SHOP = "Kandar Shop";
const BRAND_STREAMING = "Kandar Streaming";
const BRAND_COMMUNITY = "Kandar Community";

/* ===========================
   Client Setup
=========================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
});

if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const GIVEAWAY_FILE = "./data/giveaways.json";
const CREATORS_FILE = "./data/creators.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");

const ACTIVE_ORDERS = new Map();

/* ===========================
   Helper Functions
=========================== */
const teamRoleIds = (process.env.TEAM_ROLE_IDS || "")
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);
const isTeam = (m) => m.roles.cache.some(r => teamRoleIds.includes(r.id));
const sanitize = (s) => (s || "").replace(/\s+/g, "");
const formatEUR = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const toFixed2 = (n) => Math.round(n * 100) / 100;

const parsePrice = (str) => {
  const n = Number(String(str).replace(",", ".").replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : toFixed2(n);
};

function parseDuration(str) {
  if (!str) return 0;
  const m = String(str).toLowerCase().match(/^(\d+d)?(\d+h)?(\d+m)?$/);
  if (!m) return 0;
  let ms = 0;
  if (m[1]) ms += parseInt(m[1]) * 86400000;
  if (m[2]) ms += parseInt(m[2]) * 3600000;
  if (m[3]) ms += parseInt(m[3]) * 60000;
  return ms;
}

const loadGiveaways = () => JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
const saveGiveaways = (arr) => fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(arr, null, 2));

/* ===========================
   Slash Commands Definition
=========================== */
const commands = [
  new SlashCommandBuilder().setName("paypal").setDescription("Erstellt einen PayPal Link").addNumberOption(o =>
    o.setName("betrag").setDescription("Betrag in Euro (z. B. 12.34)").setRequired(true)
  ),
  new SlashCommandBuilder().setName("verifymsg").setDescription("Sendet das Verify Panel"),
  new SlashCommandBuilder().setName("panel").setDescription("Sendet das Ticket Panel"),
  new SlashCommandBuilder().setName("nuke").setDescription("Löscht viele Nachrichten").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("creator").setDescription("Creator System").addSubcommand(s => s.setName("add").setDescription("Creator Panel erstellen")),
  new SlashCommandBuilder().setName("embed").setDescription("Erstellt ein Embed via Modal"),
  new SlashCommandBuilder()
    .setName("order").setDescription("Erstellt/verwaltet eine Bestellung")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Artikel").setRequired(true))
    .addStringOption(o => o.setName("preis").setDescription("Preis (z. B. 19.99)").setRequired(true)),
  new SlashCommandBuilder().setName("finish").setDescription("Kauf abschließen (nur Team)").addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),
  new SlashCommandBuilder().setName("rename").setDescription("Ticket umbenennen").addStringOption(o => o.setName("name").setDescription("Neuer Name").setRequired(true)),
  new SlashCommandBuilder().setName("announce_twitch").setDescription("Postet Twitch Ankündigung"),
  new SlashCommandBuilder()
    .setName("giveaway").setDescription("Neues Giveaway starten")
    .addStringOption(o => o.setName("preis").setDescription("Preis").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("Dauer 1d2h30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl Gewinner").setRequired(true)),
  new SlashCommandBuilder().setName("reroll").setDescription("Giveaway rerollen").addStringOption(o => o.setName("msgid").setDescription("Message ID").setRequired(true)),
  new SlashCommandBuilder().setName("end").setDescription("Giveaway beenden").addStringOption(o => o.setName("msgid").setDescription("Message ID").setRequired(true)),
].map(c => c.toJSON());

/* ===========================
   Register Commands
=========================== */
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID), { body: commands });
    console.log("✅ Slash Commands registriert!");
  } catch (e) {
    console.error("❌ Fehler:", e);
  }
})();

/* ===========================
   Ready Event
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  // Server Stats Kategorie
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    const catName = "📊 Server Stats";
    let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
    if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

    const names = { members: "🧍 Mitglieder", online: "💻 Online", bots: "🤖 Bots", boosts: "💎 Boosts" };
    for (const n of Object.values(names)) {
      if (!guild.channels.cache.find(c => c.parentId === cat.id && c.name.startsWith(n))) {
        await guild.channels.create({
          name: `${n}: 0`, type: ChannelType.GuildVoice, parent: cat.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
        });
      }
    }

    const update = async () => {
      const m = guild.members.cache;
      const humans = m.filter(x => !x.user.bot).size;
      const online = m.filter(x => x.presence && x.presence.status !== "offline").size;
      const bots = m.filter(x => x.user.bot).size;
      const boosts = guild.premiumSubscriptionCount || 0;

      const chans = {
        members: guild.channels.cache.find(c => c.name.startsWith(names.members)),
        online: guild.channels.cache.find(c => c.name.startsWith(names.online)),
        bots: guild.channels.cache.find(c => c.name.startsWith(names.bots)),
        boosts: guild.channels.cache.find(c => c.name.startsWith(names.boosts)),
      };
      if (chans.members) chans.members.setName(`${names.members}: ${humans}`);
      if (chans.online) chans.online.setName(`${names.online}: ${online}`);
      if (chans.bots) chans.bots.setName(`${names.bots}: ${bots}`);
      if (chans.boosts) chans.boosts.setName(`${names.boosts}: ${boosts}`);
    };
    update(); setInterval(update, 5 * 60 * 1000);
  }/* ===========================
   Welcome & Booster
=========================== */
client.on("guildMemberAdd", async (member) => {
  const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du da bist! 🎉`)
    .setImage(BANNER_URL)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

client.on("guildMemberUpdate", async (oldM, newM) => {
  if (oldM.premiumSince === newM.premiumSince) return;
  if (!newM.premiumSince) return;
  const ch = newM.guild.channels.cache.get(process.env.BOOSTER_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("💎 Neuer Server-Boost!")
    .setDescription(`Vielen Dank ${newM} fürs Boosten des Servers! 🚀💖`)
    .setImage(BANNER_URL)
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

/* ===========================
   Ticket: $rename (team only)
=========================== */
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  if (!msg.content.startsWith("$rename ")) return;
  if (!isTeam(msg.member)) return msg.reply({ content: "❌ Nur Team darf Tickets umbenennen.", allowedMentions: { repliedUser: false } });
  const newName = msg.content.slice("$rename ".length).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90) || null;
  if (!newName) return msg.reply("⚠️ Bitte einen gültigen Namen angeben.");
  try {
    await msg.channel.setName(newName);
    await msg.reply(`✅ Channel umbenannt zu \`${newName}\``);
  } catch {
    await msg.reply("❌ Konnte Channel nicht umbenennen.");
  }
});

/* ===========================
   Interactions (Commands + Buttons + Modals)
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ----- VERIFY PANEL & BUTTON ----- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER_URL);
      const btn = new ButtonBuilder().setCustomId("verify_button").setLabel("Verifizieren").setStyle(ButtonStyle.Success);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }
    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      try {
        await i.member.roles.add(role);
        return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
      } catch {
        return i.reply({ content: "❌ Konnte die Verify-Rolle nicht vergeben. Bot-Rechte & Rollen-Hierarchie prüfen.", ephemeral: true });
      }
    }

    /* ----- PAYPAL ----- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const raw = i.options.getNumber("betrag");
      if (raw == null || isNaN(raw) || raw <= 0) return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });
      const amount = toFixed2(raw);
      const link = `https://www.paypal.com/paypalme/${sanitize(process.env.PAYPAL_ME_NAME || "jonahborospreitzer")}/${amount.toFixed(2)}`;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${formatEUR(amount)}** zu zahlen.`)
        .setFooter({ text: BRAND_COMMUNITY });
      const btn = new ButtonBuilder().setLabel(`Jetzt ${formatEUR(amount)} zahlen`).setStyle(ButtonStyle.Link).setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ----- TICKETS: /panel ----- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Bewerbung als Designer\n` +
          `✂️ **Cutter Bewerbung** – Bewerbung als Cutter\n` +
          `🛠️ **Highteam Anliegen** – Internes Anliegen\n` +
          `👥 **Support Anliegen** – Support`
        )
        .setImage(BANNER_URL);
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Wähle eine Ticket-Art")
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel("Shop Ticket").setValue("shop").setEmoji("💰"),
          new StringSelectMenuOptionBuilder().setLabel("Streamer Bewerbung").setValue("streamer").setEmoji("🎥"),
          new StringSelectMenuOptionBuilder().setLabel("Kandar Bewerbung").setValue("kandar").setEmoji("✍️"),
          new StringSelectMenuOptionBuilder().setLabel("Designer Bewerbung").setValue("designer").setEmoji("🎨"),
          new StringSelectMenuOptionBuilder().setLabel("Cutter Bewerbung").setValue("cutter").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("Highteam Anliegen").setValue("highteam").setEmoji("🛠️"),
          new StringSelectMenuOptionBuilder().setLabel("Support Anliegen").setValue("support").setEmoji("👥"),
        ]);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // Ticket-Auswahl -> ggf. Modal oder direkt Channel + Close-Button
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      const sendTicketWithClose = async (guild, catName, title, desc, chNamePrefix, mentionUser) => {
        let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
        if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
        const ch = await guild.channels.create({
          name: `${chNamePrefix}-${i.user.username}`,
          type: ChannelType.GuildText,
          parent: cat.id,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
            { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
          ],
        });
        const embed = new EmbedBuilder().setColor("#00FF00").setTitle(title).setDescription(desc).setImage(BANNER_URL);
        const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);
        await ch.send({ content: mentionUser ? `${i.user}` : undefined, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
        return ch;
      };

      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("item").setLabel("Artikel / Produktname").setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(modal);
      }

      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("avg_viewer").setLabel("Durchschnittliche Viewer").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("twitch_link").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(modal);
      }

      const map = {
        kandar: { cat: "✍️ Kandar Bewerbungen", title: "✍️ Kandar Bewerbung", desc: "Bitte schreibe deine Bewerbung hier.", prefix: "kandar" },
        designer: { cat: "🎨 Designer Bewerbungen", title: "🎨 Designer Bewerbung", desc: "Bitte sende dein Portfolio.", prefix: "designer" },
        cutter: { cat: "✂️ Cutter Bewerbungen", title: "✂️ Cutter Bewerbung", desc: "Bitte nenne Software & Erfahrung.", prefix: "cutter" },
        highteam: { cat: "🛠️ Highteam Anliegen", title: "🛠️ Highteam Ticket", desc: "Beschreibe bitte dein Anliegen.", prefix: "highteam" },
        support: { cat: "👥 Support Tickets", title: "👥 Support Ticket", desc: "Bitte beschreibe dein Anliegen.", prefix: "support" },
      };
      const d = map[choice];
      if (!d) return;
      const ch = await sendTicketWithClose(i.guild, d.cat, d.title, d.desc, d.prefix, true);
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // Ticket Modals -> Ticket + Close Button
    if (i.isModalSubmit() && i.customId === "shopTicketModal") {
      const payment = i.fields.getTextInputValue("payment");
      const item = i.fields.getTextInputValue("item");
      const catName = "💰 Shop Tickets";
      let cat = i.guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await i.guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
      const ch = await i.guild.channels.create({
        name: `shop-${i.user.username}`, type: ChannelType.GuildText, parent: cat.id,
        permissionOverwrites: [
          { id: i.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });
      const embed = new EmbedBuilder()
        .setColor("#00FF00").setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setImage(BANNER_URL);
      const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }
    if (i.isModalSubmit() && i.customId === "streamerTicketModal") {
      const follower = i.fields.getTextInputValue("follower");
      const avgViewer = i.fields.getTextInputValue("avg_viewer");
      const twitch = i.fields.getTextInputValue("twitch_link");
      const catName = "🎥 Streamer Bewerbungen";
      let cat = i.guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await i.guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
      const ch = await i.guild.channels.create({
        name: `streamer-${i.user.username}`, type: ChannelType.GuildText, parent: cat.id,
        permissionOverwrites: [
          { id: i.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });
      const embed = new EmbedBuilder()
        .setColor("#00FF88").setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`)
        .setImage(BANNER_URL);
      const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    // Ticket schließen -> Grund abfragen
    if (i.isButton() && i.customId === "ticket_close") {
      const modal = new ModalBuilder().setCustomId("ticketCloseModal").setTitle("🔒 Ticket schließen");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId("reason").setLabel("Grund des Schließens").setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId === "ticketCloseModal") {
      const reason = i.fields.getTextInputValue("reason");
      const ch = i.channel;
      const emb = new EmbedBuilder()
        .setColor("#ff5555")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`Grund: ${reason}\nGeschlossen von: ${i.user}`)
        .setImage(BANNER_URL)
        .setTimestamp();
      await ch.send({ embeds: [emb] });
      await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
      await ch.setName(`closed-${ch.name}`.slice(0, 90)).catch(() => {});
      return i.reply({ content: "✅ Ticket geschlossen.", ephemeral: true });
    }

    /* ----- NUKE ----- */
    if (i.isChatInputCommand() && i.commandName === "nuke") {
      const ch = i.channel;
      await i.reply({ content: "⚠️ Channel wird geleert...", ephemeral: true });
      try {
        let msgs;
        do {
          msgs = await ch.messages.fetch({ limit: 100 });
          await ch.bulkDelete(msgs, true);
        } while (msgs.size >= 2);
        await ch.send("✅ Channel erfolgreich genukt!");
      } catch {
        await ch.send("❌ Fehler beim Löschen (Hinweis: Nachrichten >14 Tage können nicht gelöscht werden).");
      }
    }

    /* ----- CREATOR ADD ----- */
    if (i.isChatInputCommand() && i.commandName === "creator" && i.options.getSubcommand() === "add") {
      const modal = new ModalBuilder().setCustomId("creatorAddModal").setTitle("Creator hinzufügen");
      const fields = [
        { id: "title", label: "Titel des Embeds", style: TextInputStyle.Short, req: true },
        { id: "creatorId", label: "Discord-ID des Creators", style: TextInputStyle.Short, req: true },
        { id: "twitch", label: "Twitch Link", style: TextInputStyle.Short, req: true },
        { id: "youtube", label: "YouTube Link (Optional)", style: TextInputStyle.Short, req: false },
        { id: "tiktok", label: "TikTok Link (Optional)", style: TextInputStyle.Short, req: false },
        { id: "instagram", label: "Instagram Link (Optional)", style: TextInputStyle.Short, req: false },
        { id: "code", label: "Creator Code (Optional)", style: TextInputStyle.Short, req: false },
      ];
      modal.addComponents(fields.map(f => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.req))));
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId === "creatorAddModal") {
      const guild = i.guild;
      const title = i.fields.getTextInputValue("title");
      const creatorId = i.fields.getTextInputValue("creatorId");
      const twitch = i.fields.getTextInputValue("twitch");
      const youtube = i.fields.getTextInputValue("youtube") || "";
      const tiktok = i.fields.getTextInputValue("tiktok") || "";
      const instagram = i.fields.getTextInputValue("instagram") || "";
      const code = i.fields.getTextInputValue("code") || "";

      const member = guild.members.cache.get(creatorId);
      if (member) {
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === "creator");
        if (role) await member.roles.add(role).catch(() => null);
      }

      const embed = new EmbedBuilder().setColor("#9b5de5").setTitle(title).addFields({ name: "Twitch", value: twitch });
      if (youtube) embed.addFields({ name: "YouTube", value: youtube });
      if (tiktok) embed.addFields({ name: "TikTok", value: tiktok });
      if (instagram) embed.addFields({ name: "Instagram", value: instagram });
      if (code) embed.addFields({ name: "Creator Code", value: code });

      const msg = await i.reply({ embeds: [embed], fetchReply: true });
      const arr = JSON.parse(fs.readFileSync(CREATORS_FILE, "utf8"));
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(CREATORS_FILE, JSON.stringify(arr, null, 2));
      return i.followUp({ content: "✅ Creator erstellt!", ephemeral: true });
    }

    /* ----- EMBED BUILDER (/embed) ----- */
    if (i.isChatInputCommand() && i.commandName === "embed") {
      const modal = new ModalBuilder().setCustomId("embedBuilderModal").setTitle("Embed erstellen");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("color").setLabel("Farbe (Hex, z.B. #ff0000)").setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Titel").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("footer").setLabel("Footer").setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("thumbnail").setLabel("Thumbnail URL (optional)").setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("image").setLabel("Bild URL (optional)").setStyle(TextInputStyle.Short).setRequired(false)),
      );
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId === "embedBuilderModal") {
      const color = i.fields.getTextInputValue("color") || "#9b5de5";
      const title = i.fields.getTextInputValue("title");
      const footer = i.fields.getTextInputValue("footer");
      const thumb = i.fields.getTextInputValue("thumbnail");
      const img = i.fields.getTextInputValue("image");
      const emb = new EmbedBuilder().setColor(color).setTitle(title);
      if (footer) emb.setFooter({ text: footer });
      if (thumb) emb.setThumbnail(thumb);
      if (img) emb.setImage(img);
      return i.reply({ embeds: [emb] });
    }

    /* ----- TWITCH ANNOUNCE (/announce_twitch) ----- */
    if (i.isChatInputCommand() && i.commandName === "announce_twitch") {
      const user = (process.env.TWITCH_USERNAME || "cxlxrized_").toLowerCase();
      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(user)}-1280x720.jpg`;
      const url = `https://twitch.tv/${encodeURIComponent(user)}`;
      const emb = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle("🔴 Live auf Twitch!")
        .setDescription(`**${user}** ist jetzt live! Komm vorbei und sag Hallo 👋\n\n👉 [Zum Stream](${url})`)
        .setImage(preview)
        .setFooter({ text: BRAND_STREAMING });
      const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Auf Twitch ansehen").setURL(url);
      return i.reply({ embeds: [emb], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ----- ORDER SYSTEM (/order) ----- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const customer = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preisStr = i.options.getString("preis");
      const price = parsePrice(preisStr);
      if (price == null || price <= 0) return i.reply({ content: "⚠️ Ungültiger Preis.", ephemeral: true });

      const items = [{ name: artikel, price }];
      const total = toFixed2(items.reduce((a, b) => a + b.price, 0));
      const payUrl = `https://www.paypal.com/paypalme/${sanitize(process.env.PAYPAL_ME_NAME || "jonahborospreitzer")}/${total.toFixed(2)}`;

      const embed = new EmbedBuilder()
        .setColor("#2ECC71")
        .setTitle(`🛒 Bestellung von ${customer.username}`)
        .setDescription(`🧾 **Kunde:** ${customer}\n🛍️ **Artikel:**\n${items.map((x, idx) => `• ${idx + 1}. ${x.name} — ${formatEUR(x.price)}`).join("\n")}\n\n**Gesamt:** ${formatEUR(total)}`)
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND_SHOP}` });

      const addBtn = new ButtonBuilder().setCustomId("order_add").setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary);
      const removeBtn = new ButtonBuilder().setCustomId("order_remove").setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary);
      const editBtn = new ButtonBuilder().setCustomId("order_processing").setLabel("🛠️ Bestellung bearbeiten").setStyle(ButtonStyle.Secondary);
      const finishBtn = new ButtonBuilder().setCustomId("order_finish").setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder().setCustomId("order_cancel").setLabel("🗑️ Abbrechen").setStyle(ButtonStyle.Danger);
      const payBtn = new ButtonBuilder().setLabel(`Jetzt zahlen: ${formatEUR(total)}`).setStyle(ButtonStyle.Link).setURL(payUrl);

      const msg = await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(addBtn, removeBtn, editBtn, finishBtn, cancelBtn), new ActionRowBuilder().addComponents(payBtn)],
        fetchReply: true
      });

      ACTIVE_ORDERS.set(msg.id, {
        guildId: i.guild.id,
        channelId: i.channel.id,
        messageId: msg.id,
        customerId: customer.id,
        items,
        done: false,
      });
    }

    // Helper zum Update des Order-Embeds & PayLink
    async function updateOrderMessage(msg, state, noteTitle = null) {
      const total = toFixed2(state.items.reduce((a, b) => a + b.price, 0));
      const payUrl = `https://www.paypal.com/paypalme/${sanitize(process.env.PAYPAL_ME_NAME || "jonahborospreitzer")}/${total.toFixed(2)}`;
      const customer = await client.users.fetch(state.customerId);

      const titleBase = noteTitle || `🛒 Bestellung von ${customer.username}`;
      const embed = new EmbedBuilder()
        .setColor(noteTitle ? "#F1C40F" : "#2ECC71")
        .setTitle(titleBase)
        .setDescription(
          `🧾 **Kunde:** <@${state.customerId}>\n` +
          (state.items.length ? `🛍️ **Artikel:**\n${state.items.map((x, idx) => `• ${idx + 1}. ${x.name} — ${formatEUR(x.price)}`).join("\n")}` : "🛍️ **Artikel:** *(leer)*") +
          `\n\n**Gesamt:** ${formatEUR(total)}`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND_SHOP}` });

      const addBtn = new ButtonBuilder().setCustomId("order_add").setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary);
      const removeBtn = new ButtonBuilder().setCustomId("order_remove").setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary);
      const editBtn = new ButtonBuilder().setCustomId("order_processing").setLabel("🛠️ Bestellung bearbeiten").setStyle(ButtonStyle.Secondary);
      const finishBtn = new ButtonBuilder().setCustomId("order_finish").setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder().setCustomId("order_cancel").setLabel("🗑️ Abbrechen").setStyle(ButtonStyle.Danger);
      const payBtn = new ButtonBuilder().setLabel(`Jetzt zahlen: ${formatEUR(total)}`).setStyle(ButtonStyle.Link).setURL(payUrl);

      await msg.edit({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(addBtn, removeBtn, editBtn, finishBtn, cancelBtn), new ActionRowBuilder().addComponents(payBtn)],
      });
    }

    // ORDER: Buttons
    if (i.isButton() && i.customId.startsWith("order_")) {
      const msg = i.message;
      const state = ACTIVE_ORDERS.get(msg.id);
      if (!state || state.done) return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      if (i.customId === "order_add") {
        const modal = new ModalBuilder().setCustomId(`orderAddModal:${msg.id}`).setTitle("➕ Artikel hinzufügen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("price").setLabel("Preis (z. B. 9.99)").setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(modal);
      }

      if (i.customId === "order_remove") {
        const modal = new ModalBuilder().setCustomId(`orderRemoveModal:${msg.id}`).setTitle("➖ Artikel entfernen");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId("index").setLabel("Position (Nr. in der Liste)").setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(modal);
      }

      if (i.customId === "order_processing") {
        if (!isTeam(i.member)) return i.reply({ content: "❌ Nur Team darf Bestellungen bearbeiten.", ephemeral: true });
        // DM an Kunden
        try {
          const user = await client.users.fetch(state.customerId);
          const dmEmb = new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle("⏳ Deine Bestellung wird bearbeitet")
            .setDescription("🛠️ Unser Team hat mit der Bearbeitung deiner Bestellung begonnen.\nBitte hab einen Moment Geduld. 💛")
            .setImage(BANNER_URL)
            .setFooter({ text: `${BRAND_SHOP}` });
          await user.send({ embeds: [dmEmb] }).catch(() => {});
        } catch {}
        await updateOrderMessage(msg, state, "🛠️ Bestellung in Bearbeitung ⏳");
        return i.reply({ content: "ℹ️ Kunde wurde informiert und Titel angepasst.", ephemeral: true });
      }

      if (i.customId === "order_cancel") {
        state.done = true;
        ACTIVE_ORDERS.set(msg.id, state);
        await msg.edit({ components: [] });
        return i.reply({ content: "🗑️ Bestellung abgebrochen.", ephemeral: true });
      }

      if (i.customId === "order_finish") {
        // Bestellung abschließen -> Auto-/finish Flow
        if (!isTeam(i.member)) return i.reply({ content: "❌ Nur Team darf abschließen.", ephemeral: true });
        state.done = true;
        ACTIVE_ORDERS.set(msg.id, state);
        await msg.edit({ components: [] });

        // Auto-assign Customer Rolle + Feedback Button
        await runFinishFlow(i.guild, i.channel, state.customerId, i.user.id);
        return i.reply({ content: "✅ Bestellung abgeschlossen & Feedback gestartet.", ephemeral: true });
      }
    }

    // ORDER: Add Modal Submit
    if (i.isModalSubmit() && i.customId.startsWith("orderAddModal:")) {
      const msgId = i.customId.split(":")[1];
      const channel = i.channel;
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (!msg) return i.reply({ content: "❌ Nachricht nicht gefunden.", ephemeral: true });
      const state = ACTIVE_ORDERS.get(msg.id);
      if (!state || state.done) return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const name = i.fields.getTextInputValue("name");
      const price = parsePrice(i.fields.getTextInputValue("price"));
      if (!name || price == null || price <= 0) return i.reply({ content: "⚠️ Ungültiger Artikel oder Preis.", ephemeral: true });

      state.items.push({ name, price });
      ACTIVE_ORDERS.set(msg.id, state);
      await updateOrderMessage(msg, state);
      return i.reply({ content: "✅ Artikel hinzugefügt.", ephemeral: true });
    }

    // ORDER: Remove Modal Submit
    if (i.isModalSubmit() && i.customId.startsWith("orderRemoveModal:")) {
      const msgId = i.customId.split(":")[1];
      const channel = i.channel;
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (!msg) return i.reply({ content: "❌ Nachricht nicht gefunden.", ephemeral: true });
      const state = ACTIVE_ORDERS.get(msg.id);
      if (!state || state.done) return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const idxStr = i.fields.getTextInputValue("index");
      const idx = parseInt(idxStr, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= state.items.length) return i.reply({ content: "⚠️ Ungültige Position.", ephemeral: true });

      state.items.splice(idx, 1);
      ACTIVE_ORDERS.set(msg.id, state);
      await updateOrderMessage(msg, state);
      return i.reply({ content: "✅ Artikel entfernt.", ephemeral: true });
    }

    /* ----- FINISH (manuell /finish) ----- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      if (!isTeam(i.member)) return i.reply({ content: "❌ Nur Team darf /finish nutzen.", ephemeral: true });
      const customer = i.options.getUser("kunde");
      await runFinishFlow(i.guild, i.channel, customer.id, i.user.id);
      return i.reply({ content: `✅ Abschluss gestartet für ${customer}.`, ephemeral: true });
    }

    /* ----- RENAME (slash) ----- */
    if (i.isChatInputCommand() && i.commandName === "rename") {
      if (!isTeam(i.member)) return i.reply({ content: "❌ Nur Team darf umbenennen.", ephemeral: true });
      const newName = i.options.getString("name").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
      try {
        await i.channel.setName(newName);
        return i.reply({ content: `✅ Channel umbenannt zu \`${newName}\``, ephemeral: true });
      } catch {
        return i.reply({ content: "❌ Konnte Channel nicht umbenennen.", ephemeral: true });
      }
    }

    /* ----- GIVEAWAY ----- */
    if (i.isChatInputCommand() && i.commandName === "giveaway") {
      const preis = i.options.getString("preis");
      const dauerStr = i.options.getString("dauer");
      const gewinner = i.options.getInteger("gewinner");
      if (!gewinner || gewinner < 1) return i.reply({ content: "⚠️ Gewinneranzahl muss ≥ 1 sein.", ephemeral: true });
      const dauer = parseDuration(dauerStr);
      if (!dauer || dauer <= 0) return i.reply({ content: "⚠️ Ungültige Dauer (z. B. 1d2h30m).", ephemeral: true });

      const endZeit = Date.now() + dauer;
      const emb = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n👥 **Teilnehmer:** 0\n⏰ **Endet in:** ${dauerStr}\n\nKlicke unten, um teilzunehmen!`)
        .setImage(BANNER_URL)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch" });
      const btn = new ButtonBuilder().setCustomId("giveaway_join").setLabel("Teilnehmen 🎉").setStyle(ButtonStyle.Primary);
      const msg = await i.reply({ embeds: [emb], components: [new ActionRowBuilder().addComponents(btn)], fetchReply: true });

      const giveaways = loadGiveaways();
      giveaways.push({ messageId: msg.id, channelId: msg.channel.id, guildId: msg.guild.id, preis, endZeit, gewinner, teilnehmer: [], beendet: false });
      saveGiveaways(giveaways);
      setTimeout(() => endGiveaway(msg.id).catch(() => {}), dauer);
    }

    if (i.isButton() && i.customId === "giveaway_join") {
      const arr = loadGiveaways();
      const g = arr.find(x => x.messageId === i.message.id);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.beendet) return i.reply({ content: "🚫 Dieses Giveaway ist beendet!", ephemeral: true });
      if (g.teilnehmer.includes(i.user.id)) return i.reply({ content: "⚠️ Du bist bereits dabei!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      saveGiveaways(arr);

      // Teilnehmerzahl im Embed aktualisieren
      const emb = EmbedBuilder.from(i.message.embeds[0]);
      const newDesc = emb.data.description.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
      emb.setDescription(newDesc);
      await i.message.edit({ embeds: [emb] });

      return i.reply({ content: "✅ Teilnahme gespeichert!", ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "reroll") {
      const msgid = i.options.getString("msgid");
      const g = loadGiveaways().find(x => x.messageId === msgid);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (!g.teilnehmer.length) return i.reply({ content: "😢 Keine Teilnehmer!", ephemeral: true });
      const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
      return i.reply(`🔁 Neue Gewinner für **${g.preis}**: ${winners.join(", ")}`);
    }

    if (i.isChatInputCommand() && i.commandName === "end") {
      await endGiveaway(i.options.getString("msgid"), i);
    }

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

/* ===========================
   Finish Flow (Rolle + Feedback)
=========================== */
async function runFinishFlow(guild, channel, customerId, staffId) {
  // Rolle zuweisen
  const roleId = process.env.CUSTOMER_ROLE_ID;
  if (roleId) {
    const mem = await guild.members.fetch(customerId).catch(() => null);
    if (mem) await mem.roles.add(roleId).catch(() => {});
  }

  // Embed + Feedback-Button
  const emb = new EmbedBuilder()
    .setColor("#E74C3C") // rot gewünscht
    .setTitle("✅ Bestellung abgeschlossen")
    .setDescription(`Vielen Dank <@${customerId}> für deinen Einkauf! 🛍️\nBitte gib uns ein kurzes Feedback – das hilft uns sehr! ✨`)
    .setImage(BANNER_URL)
    .setFooter({ text: `${BRAND_SHOP}` });
  const fbBtn = new ButtonBuilder().setCustomId(`feedback_start:${customerId}`).setLabel("💬 Feedback abgeben").setStyle(ButtonStyle.Primary);
  await channel.send({ content: `<@${customerId}>`, embeds: [emb], components: [new ActionRowBuilder().addComponents(fbBtn)] });
}

// Feedback: Seller-Auswahl (Select) -> dann Modal
client.on("interactionCreate", async (i) => {
  if (i.isButton() && i.customId.startsWith("feedback_start:")) {
    const customerId = i.customId.split(":")[1];
    if (i.user.id !== customerId && !isTeam(i.member)) return i.reply({ content: "❌ Nur der Kunde kann Feedback abgeben.", ephemeral: true });

    // Verkäuferliste (Team)
    const options = [];
    const members = await i.guild.members.fetch();
    members.forEach(m => {
      if (isTeam(m)) options.push({ label: m.user.tag, value: m.user.id });
    });
    if (!options.length) return i.reply({ content: "⚠️ Kein Team-Mitglied gefunden.", ephemeral: true });

    const select = new StringSelectMenuBuilder().setCustomId(`feedback_seller:${customerId}`).setPlaceholder("Verkäufer auswählen").addOptions(options.slice(0, 25));
    return i.reply({ content: "Bitte wähle den Verkäufer aus:", components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
  }

  if (i.isStringSelectMenu() && i.customId.startsWith("feedback_seller:")) {
    const customerId = i.customId.split(":")[1];
    const sellerId = i.values[0];
    // Modal für Sterne + Text
    const modal = new ModalBuilder().setCustomId(`feedbackModal:${customerId}:${sellerId}`).setTitle("💬 Feedback abgeben");
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("stars").setLabel("⭐ Sterne (1-5)").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("text").setLabel("📝 Dein Feedback").setStyle(TextInputStyle.Paragraph).setRequired(true)),
    );
    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId.startsWith("feedbackModal:")) {
    const [, customerId, sellerId] = i.customId.split(":");
    if (i.user.id !== customerId && !isTeam(i.member)) return i.reply({ content: "❌ Nicht erlaubt.", ephemeral: true });

    const starsRaw = i.fields.getTextInputValue("stars").trim();
    const text = i.fields.getTextInputValue("text").trim().slice(0, 1000);
    let stars = parseInt(starsRaw, 10);
    if (isNaN(stars) || stars < 1) stars = 1; if (stars > 5) stars = 5;
    const starStr = "⭐".repeat(stars) + "☆".repeat(5 - stars);

    const chId = process.env.FEEDBACK_CHANNEL_ID;
    const out = i.guild.channels.cache.get(chId);
    const emb = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("📝 Neues Feedback")
      .setDescription(`👤 **Kunde:** <@${customerId}>\n🛍️ **Verkäufer:** <@${sellerId}>\n\n${text}\n\n**Bewertung:** ${starStr}`)
      .setImage(BANNER_URL)
      .setFooter({ text: `${BRAND_SHOP}` })
      .setTimestamp();

    if (out) await out.send({ embeds: [emb] });
    return i.reply({ content: "✅ Vielen Dank für dein Feedback!", ephemeral: true });
  }
});

/* ===========================
   Giveaway Ende (shared)
=========================== */
async function endGiveaway(msgid, interaction = null) {
  const giveaways = loadGiveaways();
  const g = giveaways.find(x => x.messageId === msgid);
  if (!g || g.beendet) return;
  g.beendet = true;
  saveGiveaways(giveaways);

  try {
    const guild = await client.guilds.fetch(g.guildId);
    const ch = await guild.channels.fetch(g.channelId);
    const msg = await ch.messages.fetch(g.messageId);

    if (!g.teilnehmer.length) {
      const emb = EmbedBuilder.from(msg.embeds[0])
        .setColor("#808080")
        .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** 0\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [emb], components: [] });
      return interaction?.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
    }

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const emb = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n🏆 **Gewinner:** ${winners.join(", ")}\n👥 **Teilnehmer:** ${g.teilnehmer.length}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [emb], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* ===========================
   Logging System
=========================== */
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});
client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Nachricht gelöscht").setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`)] });
});
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
});
client.on("voiceStateUpdate", (o, n) => {
  const log = n.guild.channels.cache.get(process.env.VOICE_LOGS_CHANNEL_ID);
  if (!log) return;
  let desc = "";
  const user = n.member.user;
  if (!o.channel && n.channel) desc = `🎙️ ${user} ist **${n.channel.name}** beigetreten.`;
  else if (o.channel && !n.channel) desc = `🔇 ${user} hat **${o.channel.name}** verlassen.`;
  else if (o.channelId !== n.channelId) desc = `🔁 ${user} wechselte von **${o.channel.name}** zu **${n.channel.name}**.`;
  if (desc) log.send({ embeds: [new EmbedBuilder().setColor("#00A8FF").setTitle("🔊 Voice Log").setDescription(desc)] });
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);

  // offene Giveaways neu starten
  const g = loadGiveaways();
  for (const x of g.filter(y => !y.beendet)) {
    const rest = x.endZeit - Date.now();
    if (rest <= 0) endGiveaway(x.messageId).catch(() => {});
    else setTimeout(() => endGiveaway(x.messageId).catch(() => {}), rest);
  }
  console.log("🎉 Giveaways reaktiviert");
});