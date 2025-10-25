// ============================
// KANDAR – All-in-One Bot (Teil 1/2)
// ============================
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
  UserSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   Client + Data Setup
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

// /data Ordner & Dateien
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const GIVEAWAY_FILE = "./data/giveaways.json";
const CREATORS_FILE = "./data/creators.json";
const ORDERS_FILE   = "./data/orders.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE))   fs.writeFileSync(ORDERS_FILE, "[]");

/* ===========================
   Helpers & Constants
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND_FOOTER = "Kandar";

// Rollen / Channels aus ENV
const {
  DISCORD_TOKEN,
  BOT_ID,
  GUILD_ID,
  VERIFY_ROLE_ID,
  CUSTOMER_ROLE_ID,
  FINISH_ROLE_IDS,              // kommasepariert
  MEMBER_LOGS_CHANNEL_ID,
  MESSAGE_LOGS_CHANNEL_ID,
  CHANNEL_LOGS_CHANNEL_ID,
  ROLE_LOGS_CHANNEL_ID,
  VOICE_LOGS_CHANNEL_ID,
  SERVER_LOGS_CHANNEL_ID,       // optional
  WELCOME_CHANNEL_ID,
  BOOSTER_CHANNEL_ID,
  FEEDBACK_CHANNEL_ID,
  TICKET_LOG_CHANNEL_ID,        // optional
  TWITCH_USER_NAME,             // z.B. "kandarstream"
} = process.env;

const FINISH_ROLES = (FINISH_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

// Data load/save
const loadJSON  = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const saveJSON  = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

const loadGiveaways = () => loadJSON(GIVEAWAY_FILE);
const saveGiveaways = (arr) => saveJSON(GIVEAWAY_FILE, arr);

const loadOrders = () => loadJSON(ORDERS_FILE);
const saveOrders = (arr) => saveJSON(ORDERS_FILE, arr);

/* ===========================
   Utils
=========================== */
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

function formatCurrency(num) {
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num); }
  catch { return `${num}€`; }
}

function hasAnyRole(member, roleIds) {
  if (!roleIds.length) return true; // wenn keine definiert, erlauben
  return roleIds.some(id => member.roles.cache.has(id));
}

/* ===========================
   Slash Commands
=========================== */
const commands = [
  // PayPal
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o =>
      o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)
    ),

  // Tickets Panel
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Sendet das Ticket-Panel (Dropdown)"),

  // Verify
  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  // Nuke
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht viele Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // Creator
  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System verwalten")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")
    ),

  // Giveaways
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Starte ein neues Giveaway")
    .addStringOption(o => o.setName("preis").setDescription("Preis").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("z. B. 1d, 2h, 30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl der Gewinner").setRequired(true)),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Ziehe neue Gewinner für ein Giveaway")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  // Twitch Announce
  new SlashCommandBuilder()
    .setName("announce_stream")
    .setDescription("Poste ein Twitch-Stream-Announcement (Banner + Vorschau)"),

  // Order (KEIN Ticket, alles im aktuellen Channel)
  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstelle eine Bestellung (ohne Ticket) im aktuellen Channel")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis in EUR").setRequired(true)),

  // Finish (nur bestimmte Rollen)
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Bestellung/Ticket abschließen und Feedback starten")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),
].map(c => c.toJSON());

// Commands registrieren
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(BOT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash Commands registriert!");
  } catch (err) {
    console.error("❌ Fehler beim Registrieren:", err);
  }
})();

/* ===========================
   Ready: Server Stats + Re-Arm Giveaways
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  // Server Stats Kategorie + Channels
  const categoryName = "📊 Server Stats";
  let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
  if (!category)
    category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

  const stats = {
    members: "🧍‍♂️ Mitglieder",
    online: "💻 Online",
    bots: "🤖 Bots",
    boosts: "💎 Boosts"
  };

  for (const name of Object.values(stats)) {
    if (!guild.channels.cache.find(c => c.parentId === category.id && c.name.startsWith(name))) {
      await guild.channels.create({
        name: `${name}: 0`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
      });
    }
  }

  async function updateStats() {
    const members = guild.members.cache;
    const online = members.filter(m => m.presence && m.presence.status !== "offline").size;
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.size - bots;
    const boosts = guild.premiumSubscriptionCount || 0;

    const channels = {
      members: guild.channels.cache.find(c => c.name.startsWith(stats.members)),
      online: guild.channels.cache.find(c => c.name.startsWith(stats.online)),
      bots: guild.channels.cache.find(c => c.name.startsWith(stats.bots)),
      boosts: guild.channels.cache.find(c => c.name.startsWith(stats.boosts)),
    };

    if (channels.members) await channels.members.setName(`${stats.members}: ${humans}`);
    if (channels.online) await channels.online.setName(`${stats.online}: ${online}`);
    if (channels.bots) await channels.bots.setName(`${stats.bots}: ${bots}`);
    if (channels.boosts) await channels.boosts.setName(`${stats.boosts}: ${boosts}`);
  }
  updateStats();
  setInterval(updateStats, 5 * 60 * 1000);

  // offene Giveaways nach Neustart weiterlaufen lassen
  const giveaways = loadGiveaways();
  for (const g of giveaways.filter(x => !x.beendet)) {
    const rest = g.endZeit - Date.now();
    if (rest <= 0) endGiveaway(g.messageId).catch(() => {});
    else setTimeout(() => endGiveaway(g.messageId).catch(() => {}), rest);
  }
  console.log(`🎉 Reaktivierte Giveaways: ${giveaways.filter(x => !x.beendet).length}`);
});

/* ===========================
   Welcome + Booster Embeds
=========================== */
client.on("guildMemberAdd", async (member) => {
  const ch = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du da bist! 🎉`)
    .setImage(BANNER_URL)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

client.on("guildMemberUpdate", async (oldM, newM) => {
  if (oldM.premiumSince === newM.premiumSince) return;
  if (!newM.premiumSince) return;
  const ch = newM.guild.channels.cache.get(BOOSTER_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("💎 Neuer Server-Boost!")
    .setDescription(`Vielen Dank ${newM} fürs Boosten des Servers! 🚀💖`)
    .setImage(BANNER_URL)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

/* ===========================
   Interaction Handler (alles in einem Listener)
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON ---- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const button = new ButtonBuilder()
        .setCustomId("verify_button")
        .setLabel("Verifizieren")
        .setStyle(ButtonStyle.Success);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }

    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      if (i.member.roles.cache.has(role.id))
        return i.reply({ content: "✅ Du bist bereits verifiziert!", ephemeral: true });

      await i.member.roles.add(role);
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
    }

    /* ---- PAYPAL ---- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (!amount || amount <= 0)
        return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });

      const link = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${amount}€** zu zahlen.`)
        .setFooter({ text: "Kandar Community" });
      const btn = new ButtonBuilder().setLabel(`Jetzt ${amount}€ zahlen`).setStyle(ButtonStyle.Link).setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---- TICKET PANEL /panel ---- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Deine Bewerbung als Designer starten\n` +
          `✂️ **Cutter Bewerbung** – Deine Bewerbung als Cutter starten\n` +
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n`+
          `👥 **Support Anliegen** – Support Anliegen\n`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Wähle eine Ticket-Art")
        .addOptions([
          { label: "Shop Ticket", value: "shop", emoji: "💰" },
          { label: "Streamer Bewerbung", value: "streamer", emoji: "🎥" },
          { label: "Kandar Bewerbung", value: "kandar", emoji: "✍️" },
          { label: "Designer Bewerbung", value: "designer", emoji: "🎨" },
          { label: "Cutter Bewerbung", value: "cutter", emoji: "✂️" },
          { label: "Highteam Anliegen", value: "highteam", emoji: "🛠️" },
          { label: "Support Anliegen", value: "support", emoji: "👥" },
        ]);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // Dropdown -> ggf. Modals/Channel erstellen
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // SHOP: Modal
      if (choice === "shop") {
        const modal = new ModalBuilder()
          .setCustomId("shopTicketModal")
          .setTitle("💰 Shop Ticket erstellen");

        const payment = new TextInputBuilder()
          .setCustomId("payment")
          .setLabel("Zahlungsmethode (z.B. PayPal, Überweisung)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const item = new TextInputBuilder()
          .setCustomId("item")
          .setLabel("Artikel / Produktname")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(payment),
          new ActionRowBuilder().addComponents(item)
        );
        return i.showModal(modal);
      }

      // STREAMER: Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder()
          .setCustomId("streamerTicketModal")
          .setTitle("🎥 Streamer Bewerbung");

        const follower = new TextInputBuilder()
          .setCustomId("follower")
          .setLabel("Follower (z.B. 1200)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const avgViewer = new TextInputBuilder()
          .setCustomId("avg_viewer")
          .setLabel("Durchschnittliche Viewer")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const twitch = new TextInputBuilder()
          .setCustomId("twitch_link")
          .setLabel("Twitch-Link")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(follower),
          new ActionRowBuilder().addComponents(avgViewer),
          new ActionRowBuilder().addComponents(twitch)
        );
        return i.showModal(modal);
      }

      // Andere Kategorien: Direkt Channel
      const map = {
        kandar:  { title: "✍️ Kandar Bewerbung",   cat: "✍️ Kandar Bewerbungen",   desc: "Bitte schreibe deine Bewerbung hier." },
        designer:{ title: "🎨 Designer Bewerbung",  cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter:  { title: "✂️ Cutter Bewerbung",    cat: "✂️ Cutter Bewerbungen",   desc: "Bitte nenne Software & Erfahrung." },
        highteam:{ title: "🛠️ Highteam Ticket",     cat: "🛠️ Highteam Anliegen",    desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket",       cat: "👥 Support Anliegen",     desc: "Beschreibe bitte dein Anliegen." },
      };
      const data = map[choice];
      if (!data) return;

      const guild = i.guild;
      let cat = guild.channels.cache.find(c => c.name === data.cat && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: data.cat, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: `${data.title.split(" ")[0]}-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(data.title)
        .setDescription(data.desc)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      await ch.send({ content: `${i.user}`, embeds: [embed] });
      const log = guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
      if (log) log.send({ embeds: [EmbedBuilder.from(embed).setTitle(`🧾 ${data.title} erstellt von ${i.user.username}`)] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // SHOP Modal Submit
    if (i.isModalSubmit() && i.customId === "shopTicketModal") {
      const payment = i.fields.getTextInputValue("payment");
      const item = i.fields.getTextInputValue("item");
      const guild = i.guild;

      const catName = "💰 Shop Tickets";
      let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: `💰-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      await ch.send({ content: `${i.user}`, embeds: [embed] });
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // STREAMER Modal Submit
    if (i.isModalSubmit() && i.customId === "streamerTicketModal") {
      const follower = i.fields.getTextInputValue("follower");
      const avgViewer = i.fields.getTextInputValue("avg_viewer");
      const twitch = i.fields.getTextInputValue("twitch_link");
      const guild = i.guild;

      const catName = "🎥 Streamer Bewerbungen";
      let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: `🎥-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      await ch.send({ content: `${i.user}`, embeds: [embed] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- CREATOR ADD (ein Modal, Linkliste im Textfeld) ---- */
    if (i.isChatInputCommand() && i.commandName === "creator" && i.options.getSubcommand() === "add") {
      const modal = new ModalBuilder().setCustomId("creatorAddModal").setTitle("Creator hinzufügen");

      const title = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Titel des Embeds")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const creatorId = new TextInputBuilder()
        .setCustomId("creatorId")
        .setLabel("Discord-ID des Creators")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const twitch = new TextInputBuilder()
        .setCustomId("twitch")
        .setLabel("Twitch Link (Pflicht)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const links = new TextInputBuilder()
        .setCustomId("links")
        .setLabel("Optionale Links (youtube:, tiktok:, instagram:, code:)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(creatorId),
        new ActionRowBuilder().addComponents(twitch),
        new ActionRowBuilder().addComponents(links),
      );
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "creatorAddModal") {
      const guild = i.guild;
      const title = i.fields.getTextInputValue("title");
      const creatorId = i.fields.getTextInputValue("creatorId");
      const twitch = i.fields.getTextInputValue("twitch");
      const linksRaw = i.fields.getTextInputValue("links") || "";

      // einfache Parser für optionale Links
      const lower = linksRaw.toLowerCase();
      const getLink = (key) => {
        const m = lower.match(new RegExp(`${key}\\s*:\\s*(\\S+)`));
        return m ? m[1] : "";
      };
      const youtube   = getLink("youtube");
      const tiktok    = getLink("tiktok");
      const instagram = getLink("instagram");
      const code      = getLink("code");

      const member = guild.members.cache.get(creatorId);
      if (member) {
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === "creator");
        if (role) await member.roles.add(role).catch(() => null);
      }

      const embed = new EmbedBuilder()
        .setColor("#9b5de5")
        .setTitle(title)
        .addFields({ name: "Twitch", value: twitch });
      if (youtube)   embed.addFields({ name: "YouTube", value: youtube });
      if (tiktok)    embed.addFields({ name: "TikTok", value: tiktok });
      if (instagram) embed.addFields({ name: "Instagram", value: instagram });
      if (code)      embed.addFields({ name: "Creator Code", value: code });
      embed.setImage(BANNER_URL).setFooter({ text: BRAND_FOOTER });

      const msg = await i.reply({ embeds: [embed], fetchReply: true });
      const arr = JSON.parse(fs.readFileSync(CREATORS_FILE, "utf8"));
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(CREATORS_FILE, JSON.stringify(arr, null, 2));
      return i.followUp({ content: "✅ Creator erstellt!", ephemeral: true });
    }

    /* ---- NUKE ---- */
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

    /* ---- TWITCH ANNOUNCE ---- */
    if (i.isChatInputCommand() && i.commandName === "announce_stream") {
      const name = (TWITCH_USER_NAME || "").toLowerCase();
      if (!name) return i.reply({ content: "❌ TWITCH_USER_NAME ist nicht gesetzt.", ephemeral: true });

      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${name}-1280x720.jpg`;
      const url = `https://twitch.tv/${name}`;

      const embed = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle("🔴 Live auf Twitch!")
        .setURL(url)
        .setDescription(`**${name}** ist jetzt live! Schau vorbei: ${url}`)
        .setImage(BANNER_URL)
        .setThumbnail(preview)
        .setFooter({ text: "Kandar Streaming" })
        .setTimestamp();

      const btn = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(url)
        .setLabel("Zum Stream");

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---- ORDER SYSTEM (KEIN Ticket) ---- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const kunde = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preis = i.options.getNumber("preis");

      // Neues Order-Objekt
      const orders = loadOrders();
      // Embed vorbereiten
      const orderEmbed = new EmbedBuilder()
        .setColor("#00AA88")
        .setTitle(`🧾 Bestellung von ${kunde.username}`)
        .setDescription(`🛍️ **Artikel:** ${artikel}\n💶 **Preis:** ${formatCurrency(preis)}`)
        .addFields({ name: "🧺 Warenkorb", value: `• ${artikel} — ${formatCurrency(preis)}` })
        .addFields({ name: "💰 Gesamt", value: `${formatCurrency(preis)}`, inline: true })
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Shop" })
        .setTimestamp();

      // Menü: Artikel hinzufügen / Bestellung abschließen
      const menu = new StringSelectMenuBuilder()
        .setCustomId("order_menu:new")
        .setPlaceholder("Bestell-Aktion wählen")
        .addOptions([
          { label: "Artikel hinzufügen", value: "add_item", emoji: "🧩" },
          { label: "Bestellung abschließen", value: "complete", emoji: "✅" },
        ]);

      const msg = await i.reply({
        content: `👤 Kunde: ${kunde}`,
        embeds: [orderEmbed],
        components: [new ActionRowBuilder().addComponents(menu)],
        fetchReply: true,
      });

      orders.push({
        messageId: msg.id,
        channelId: msg.channel.id,
        guildId: msg.guild.id,
        kundeId: kunde.id,
        items: [{ name: artikel, price: preis }],
        closed: false,
      });
      saveOrders(orders);
    }

    // Order Menu Handling
    if (i.isStringSelectMenu() && i.customId.startsWith("order_menu")) {
      const orders = loadOrders();
      const order = orders.find(o => o.messageId === i.message.id);
      if (!order) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });
      if (order.closed) return i.reply({ content: "🚫 Bestellung bereits abgeschlossen.", ephemeral: true });

      const choice = i.values[0];
      if (choice === "add_item") {
        const modal = new ModalBuilder().setCustomId(`order_add:${order.messageId}`).setTitle("🧩 Artikel hinzufügen");
        const item = new TextInputBuilder().setCustomId("item_name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true);
        const price = new TextInputBuilder().setCustomId("item_price").setLabel("Preis (EUR)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(item),
          new ActionRowBuilder().addComponents(price)
        );
        return i.showModal(modal);
      }
      if (choice === "complete") {
        order.closed = true;
        saveOrders(orders);
        // Komponenten deaktivieren
        const disabledRow = new ActionRowBuilder().addComponents(
          StringSelectMenuBuilder.from(i.component).setDisabled(true)
        );

        // Embed aktualisieren
        const total = order.items.reduce((s, it) => s + Number(it.price || 0), 0);
        const embed = EmbedBuilder.from(i.message.embeds[0])
          .setColor("#2ECC71")
          .addFields({ name: "📦 Status", value: "✅ **Abgeschlossen**" })
          .setFooter({ text: "Kandar Shop" });

        await i.update({ embeds: [embed], components: [disabledRow] });
        return;
      }
    }

    // Order Add Item Modal Submit
    if (i.isModalSubmit() && i.customId.startsWith("order_add:")) {
      const msgId = i.customId.split(":")[1];
      const orders = loadOrders();
      const order = orders.find(o => o.messageId === msgId);
      if (!order) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });
      if (order.closed) return i.reply({ content: "🚫 Bestellung bereits abgeschlossen.", ephemeral: true });

      const name = i.fields.getTextInputValue("item_name");
      const priceStr = i.fields.getTextInputValue("item_price").replace(",", ".").replace("€", "").trim();
      const price = Number(priceStr);
      if (Number.isNaN(price) || price < 0) return i.reply({ content: "⚠️ Ungültiger Preis.", ephemeral: true });

      order.items.push({ name, price });
      saveOrders(orders);

      // Nachricht holen und Embed updaten
      const ch = await client.channels.fetch(order.channelId);
      const msg = await ch.messages.fetch(order.messageId);
      const old = EmbedBuilder.from(msg.embeds[0]);

      const list = order.items.map(it => `• ${it.name} — ${formatCurrency(it.price)}`).join("\n");
      const total = order.items.reduce((s, it) => s + Number(it.price || 0), 0);

      const newEmbed = old.data
        ? EmbedBuilder.from(old)
        : new EmbedBuilder();

      newEmbed.setFields(
        { name: "🧺 Warenkorb", value: list || "—" },
        { name: "💰 Gesamt", value: `${formatCurrency(total)}`, inline: true }
      );

      await msg.edit({ embeds: [newEmbed] });
      return i.reply({ content: "✅ Artikel hinzugefügt.", ephemeral: true });
    }

    /* ---- FINISH (nur bestimmte Rollen) & FEEDBACK Flow ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      if (!hasAnyRole(i.member, FINISH_ROLES)) {
        return i.reply({ content: "⛔ Du darfst diesen Befehl nicht verwenden.", ephemeral: true });
      }
      const kunde = i.options.getUser("kunde");

      // Rolle vergeben
      const role = i.guild.roles.cache.get(CUSTOMER_ROLE_ID);
      if (role) {
        const member = await i.guild.members.fetch(kunde.id).catch(() => null);
        if (member && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
      }

      // Embed (rot) + Feedback-Button
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("✅ Auftrag abgeschlossen")
        .setDescription(`🎉 ${kunde} **Bestellung/Anfrage abgeschlossen**.\n\nBitte **Feedback** abgeben!`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      const feedbackBtn = new ButtonBuilder()
        .setCustomId(`feedback_start:${kunde.id}`)
        .setLabel("Feedback geben")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Primary);

      return i.reply({ content: `${kunde}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(feedbackBtn)] });
    }

    // Feedback Button -> Verkäufer wählen (UserSelect)
    if (i.isButton() && i.customId.startsWith("feedback_start:")) {
      const kundeId = i.customId.split(":")[1];
      // Verkäufer-Auswahl via UserSelect
      const userSelect = new UserSelectMenuBuilder()
        .setCustomId(`feedback_pick_seller:${kundeId}`)
        .setPlaceholder("Wähle den Verkäufer aus")
        .setMinValues(1)
        .setMaxValues(1);

      const row = new ActionRowBuilder().addComponents(userSelect);

      return i.reply({
        content: "👤 Bitte wähle den Verkäufer:",
        components: [row],
        ephemeral: true,
      });
    }

    // Verkäufer gewählt -> Modal (Sterne + Text)
    if (i.isUserSelectMenu() && i.customId.startsWith("feedback_pick_seller:")) {
      const kundeId = i.customId.split(":")[1];
      const sellerId = i.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`feedback_modal:${kundeId}:${sellerId}`)
        .setTitle("📝 Feedback abgeben");

      const stars = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("⭐ Sterne (1-5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const text = new TextInputBuilder()
        .setCustomId("text")
        .setLabel("💬 Dein Feedback")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(stars),
        new ActionRowBuilder().addComponents(text),
      );

      return i.showModal(modal);
    }

    // Feedback Modal Submit -> Embed in Feedback-Channel
    if (i.isModalSubmit() && i.customId.startsWith("feedback_modal:")) {
      const [, kundeId, sellerId] = i.customId.split(":");
      const starsStr = i.fields.getTextInputValue("stars").trim();
      const text = i.fields.getTextInputValue("text");

      const starsNum = Number(starsStr);
      if (Number.isNaN(starsNum) || starsNum < 1 || starsNum > 5) {
        return i.reply({ content: "⚠️ Bitte 1–5 Sterne angeben.", ephemeral: true });
      }
      const starsEmojis = "⭐".repeat(starsNum) + "☆".repeat(5 - starsNum);

      const ch = i.guild.channels.cache.get(FEEDBACK_CHANNEL_ID);
      if (!ch) return i.reply({ content: "❌ Feedback-Channel nicht gefunden!", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("📝 Neues Feedback")
        .setDescription(
          `🙍‍♂️ **Kunde:** <@${kundeId}>\n` +
          `🧑‍💼 **Verkäufer:** <@${sellerId}>\n` +
          `⭐ **Bewertung:** ${starsEmojis}\n\n` +
          `💬 **Feedback:**\n${text}`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Shop" })
        .setTimestamp();

      await ch.send({ embeds: [embed] });
      return i.reply({ content: "✅ Danke für dein Feedback!", ephemeral: true });
    }

    /* ---- GIVEAWAY ---- */
    if (i.isChatInputCommand() && i.commandName === "giveaway") {
      const preis = i.options.getString("preis");
      const dauerStr = i.options.getString("dauer");
      const gewinner = i.options.getInteger("gewinner");
      if (!gewinner || gewinner < 1)
        return i.reply({ content: "⚠️ Bitte gib eine gültige Gewinneranzahl an!", ephemeral: true });

      const dauer = parseDuration(dauerStr);
      if (!dauer || dauer <= 0)
        return i.reply({ content: "⚠️ Ungültige Dauer (z. B. 1d2h30m)", ephemeral: true });

      const endZeit = Date.now() + dauer;

      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(
          `**Preis:** ${preis}\n` +
          `🎁 **Gewinner:** ${gewinner}\n` +
          `👥 **Teilnehmer:** \`0\`\n` +
          `⏰ **Endet in:** ${dauerStr}\n\n` +
          `Klicke unten, um teilzunehmen!`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: "Endet automatisch" })
        .setTimestamp(new Date(endZeit));

      const btn = new ButtonBuilder()
        .setCustomId("giveaway_join")
        .setLabel("Teilnehmen 🎉")
        .setStyle(ButtonStyle.Primary);

      const msg = await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
        fetchReply: true
      });

      const giveaways = loadGiveaways();
      giveaways.push({
        messageId: msg.id,
        channelId: msg.channel.id,
        guildId: msg.guild.id,
        preis,
        endZeit,
        gewinner,
        teilnehmer: [],
        beendet: false,
      });
      saveGiveaways(giveaways);
      setTimeout(() => endGiveaway(msg.id).catch(() => {}), dauer);
    }

    if (i.isButton() && i.customId === "giveaway_join") {
      const giveaways = loadGiveaways();
      const g = giveaways.find(x => x.messageId === i.message.id);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.beendet) return i.reply({ content: "🚫 Dieses Giveaway ist beendet!", ephemeral: true });
      if (g.teilnehmer.includes(i.user.id))
        return i.reply({ content: "⚠️ Du bist bereits dabei!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      saveGiveaways(giveaways);

      // Teilnehmer-Anzahl im Embed updaten
      const newCount = g.teilnehmer.length;
      const emb = EmbedBuilder.from(i.message.embeds[0]);
      const newDesc = emb.data.description
        .replace(/👥 \*\*Teilnehmer:\*\* `\d+`/, `👥 **Teilnehmer:** \`${newCount}\``);
      emb.setDescription(newDesc);
      await i.message.edit({ embeds: [emb] });

      return i.reply({ content: "✅ Teilnahme gespeichert!", ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "reroll") {
      const msgid = i.options.getString("msgid");
      const g = loadGiveaways().find(x => x.messageId === msgid);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (!g.teilnehmer.length) return i.reply({ content: "😢 Keine Teilnehmer!", ephemeral: true });

      const winners = Array.from({ length: g.gewinner }, () =>
        `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`
      );
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
   Giveaway beenden (shared)
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

    // Teilnehmer-Anzahl sichern
    const joinedCount = g.teilnehmer.length;

    if (!g.teilnehmer.length) {
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor("#808080")
        .setDescription(
          `**Preis:** ${g.preis}\n` +
          `🎁 **Gewinner:** ${g.gewinner}\n` +
          `👥 **Teilnehmer:** \`${joinedCount}\`\n` +
          `❌ Keine Teilnehmer 😢`
        )
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    const winners = Array.from({ length: g.gewinner }, () =>
      `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`
    );

    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(
        `**Preis:** ${g.preis}\n` +
        `🎁 **Gewinner:** ${g.gewinner}\n` +
        `👥 **Teilnehmer:** \`${joinedCount}\`\n` +
        `🏆 **Gewinner:** ${winners.join(", ")}`
      )
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}
/* ===========================
   Logging System (vollständig)
=========================== */

// Member
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("👋 Neues Mitglied")
          .setDescription(`${m} ist dem Server beigetreten.`)
          .setThumbnail(m.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🚪 Mitglied hat den Server verlassen")
          .setDescription(`${m.user.tag} (${m.id}) hat den Server verlassen.`)
          .setThumbnail(m.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

// Nachrichten
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(MESSAGE_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🗑 Nachricht gelöscht")
          .setDescription(
            `👤 **Autor:** ${msg.author}\n📍 **Channel:** ${msg.channel}\n\n💬 **Inhalt:**\n${msg.content || "[Embed/Datei]"}`
          )
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

client.on("messageUpdate", (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  const log = newMsg.guild.channels.cache.get(MESSAGE_LOGS_CHANNEL_ID);
  if (log && oldMsg.content !== newMsg.content)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#ffaa00")
          .setTitle("✏️ Nachricht bearbeitet")
          .setDescription(
            `👤 **Autor:** ${newMsg.author}\n📍 **Channel:** ${newMsg.channel}\n\n🕓 **Vorher:**\n${oldMsg.content}\n\n🆕 **Nachher:**\n${newMsg.content}`
          )
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

// Channel Logs
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("📢 Channel erstellt")
          .setDescription(`📂 **Name:** ${ch.name}\n🆔 **ID:** ${ch.id}`)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🗑 Channel gelöscht")
          .setDescription(`📂 **Name:** ${ch.name}\n🆔 **ID:** ${ch.id}`)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

// Rollen Logs
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🎭 Rolle erstellt")
          .setDescription(`🆔 **ID:** ${r.id}\n📛 **Name:** ${r.name}`)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🎭 Rolle gelöscht")
          .setDescription(`📛 **Name:** ${r.name}\n🆔 **ID:** ${r.id}`)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

// Voice Logs
client.on("voiceStateUpdate", (o, n) => {
  const log = n.guild.channels.cache.get(VOICE_LOGS_CHANNEL_ID);
  if (!log) return;
  let desc = "";
  const user = n.member.user;
  if (!o.channel && n.channel)
    desc = `🎙️ ${user} ist **${n.channel.name}** beigetreten.`;
  else if (o.channel && !n.channel)
    desc = `🔇 ${user} hat **${o.channel.name}** verlassen.`;
  else if (o.channelId !== n.channelId)
    desc = `🔁 ${user} wechselte von **${o.channel.name}** zu **${n.channel.name}**.`;
  if (desc)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00A8FF")
          .setTitle("🔊 Voice Log")
          .setDescription(desc)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

// Server Update Logs (optional)
client.on("guildUpdate", (oldG, newG) => {
  const log = newG.channels.cache.get(SERVER_LOGS_CHANNEL_ID);
  if (!log) return;
  if (oldG.name !== newG.name)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#ffaa00")
          .setTitle("⚙️ Server geändert")
          .setDescription(`📛 **Alter Name:** ${oldG.name}\n🆕 **Neuer Name:** ${newG.name}`)
          .setTimestamp()
          .setFooter({ text: "Kandar Logs" }),
      ],
    });
});

/* ===========================
   Webserver + Login
=========================== */
import express from "express";
const app = express();
app.get("/", (_, res) => res.send("✅ Kandar Bot läuft!"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌍 Keep-Alive Server aktiv")
);

client.login(DISCORD_TOKEN)
  .then(() => console.log("🤖 Bot erfolgreich eingeloggt!"))
  .catch(err => console.error("❌ Login fehlgeschlagen:", err));
