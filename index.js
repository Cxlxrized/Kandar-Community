// ==============================
// Kandar – All-in-One Discord Bot (Teil 1/2)
// ==============================

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

if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const GIVEAWAY_FILE = "./data/giveaways.json";
const CREATORS_FILE = "./data/creators.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");

// Branding
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND = "Kandar";

/* ===========================
   Slash Commands
=========================== */
const commands = [
  // PayPal
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink (Centbeträge erlaubt)")
    .addNumberOption(o =>
      o.setName("betrag")
        .setDescription("Betrag in EUR (z. B. 9.99)")
        .setRequired(true)
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
    .addStringOption(o => o.setName("dauer").setDescription("Dauer z. B. 1d, 2h, 30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl der Gewinner").setRequired(true)),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Ziehe neue Gewinner für ein Giveaway")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  // Custom Embed
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Erstelle ein individuelles Embed über ein Modal"),

  // Order System (kein Ticket!)
  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt ein Bestell-Panel im aktuellen Channel")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Erster Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis in EUR (auch Cent)").setRequired(true)),

  // Finish (nur bestimmte Rollen)
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback abfragen (nur Support/Verkäufer)")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),

  // Twitch Stream Announce
  new SlashCommandBuilder()
    .setName("streamannounce")
    .setDescription("Postet eine Stream-Ankündigung mit Vorschau (Twitch)"),
].map(c => c.toJSON());

/* ===========================
   Commands registrieren
=========================== */
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash Commands registriert!");
  } catch (err) {
    console.error("❌ Fehler beim Registrieren:", err);
  }
})();

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
const loadGiveaways = () => JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
const saveGiveaways = (arr) => fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(arr, null, 2));

function formatEUR(n) {
  // Immer zwei Nachkommastellen, Punkt statt Komma (PayPal.me)
  return Number(n).toFixed(2);
}

function paypalLink(amountNumber) {
  const base = process.env.PAYPAL_ME || "https://www.paypal.com/paypalme/jonahborospreitzer";
  const amt = formatEUR(amountNumber);
  return `${base}/${amt}`;
}

/* ===========================
   In-Memory States
=========================== */
const activeOrders = new Map(); 
// key = messageId, value = { guildId, channelId, customerId, items:[{name, price}], closed:false }

/* ===========================
   READY: Server Stats + Re-Arm Giveaways
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
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

  // offene Giveaways reaktivieren
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
  const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du da bist! 🎉`)
    .setImage(BANNER_URL)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `${BRAND} • Willkommen` })
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
    .setFooter({ text: `${BRAND} • Booster` })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

/* ===========================
   Interaction Handler
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON (immer Rolle geben) ---- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND} • Verify` });

      const button = new ButtonBuilder()
        .setCustomId("verify_button")
        .setLabel("Verifizieren")
        .setStyle(ButtonStyle.Success);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }

    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });

      try {
        await i.member.roles.add(role);
        return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
      } catch (err) {
        console.error(err);
        return i.reply({ content: "❌ Konnte die Verify-Rolle nicht vergeben. Bitte prüfe Bot-Rolle & Hierarchie.", ephemeral: true });
      }
    }

    /* ---- PAYPAL ---- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (amount == null || amount <= 0)
        return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });

      const link = paypalLink(amount);
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${formatEUR(amount)}€** zu zahlen.`)
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND} Shop` });

      const btn = new ButtonBuilder().setLabel(`Jetzt ${formatEUR(amount)}€ zahlen`).setStyle(ButtonStyle.Link).setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---- CUSTOM EMBED (/embed) ---- */
    if (i.isChatInputCommand() && i.commandName === "embed") {
      const modal = new ModalBuilder().setCustomId("customEmbedModal").setTitle("Custom Embed erstellen");
      const color = new TextInputBuilder().setCustomId("color").setLabel("Farbe (HEX, z.B. #9b5de5)").setStyle(TextInputStyle.Short).setRequired(false);
      const title = new TextInputBuilder().setCustomId("title").setLabel("Titel").setStyle(TextInputStyle.Short).setRequired(true);
      const footer = new TextInputBuilder().setCustomId("footer").setLabel("Footer").setStyle(TextInputStyle.Short).setRequired(false);
      const thumb = new TextInputBuilder().setCustomId("thumb").setLabel("Thumbnail URL (optional)").setStyle(TextInputStyle.Short).setRequired(false);
      const image = new TextInputBuilder().setCustomId("image").setLabel("Embed Bild URL (optional)").setStyle(TextInputStyle.Short).setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(color),
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(footer),
        new ActionRowBuilder().addComponents(thumb),
        new ActionRowBuilder().addComponents(image),
      );
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "customEmbedModal") {
      const color = i.fields.getTextInputValue("color") || "#9b5de5";
      const title = i.fields.getTextInputValue("title");
      const footer = i.fields.getTextInputValue("footer") || `${BRAND}`;
      const thumb = i.fields.getTextInputValue("thumb");
      const image = i.fields.getTextInputValue("image");

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setFooter({ text: footer });
      if (thumb) embed.setThumbnail(thumb);
      if (image) embed.setImage(image);

      await i.reply({ embeds: [embed] });
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
          `🎨 **Designer Bewerbung** – Portfolio & Bewerbung\n` +
          `✂️ **Cutter Bewerbung** – Software & Erfahrung\n` +
          `🛠️ **Highteam Anliegen** – Intern\n` +
          `👥 **Support Anliegen** – Hilfe & Fragen`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND} Tickets` });

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

    // Dropdown -> ggf. Modals/Channel erstellen (+ Close-Button)
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
        kandar: { title: "✍️ Kandar Bewerbung", cat: "✍️ Kandar Bewerbungen", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter: { title: "✂️ Cutter Bewerbung", cat: "✂️ Cutter Bewerbungen", desc: "Bitte nenne Software & Erfahrung." },
        highteam: { title: "🛠️ Highteam Ticket", cat: "🛠️ Highteam Anliegen", desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket", cat: "👥 Support Anliegen", desc: "Beschreibe bitte dein Anliegen." },
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

      const openEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(data.title)
        .setDescription(data.desc)
        .setFooter({ text: `${BRAND} Tickets` })
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [openEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const openEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setFooter({ text: `${BRAND} Tickets` })
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [openEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const openEmbed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`)
        .setFooter({ text: `${BRAND} Tickets` })
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [openEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- Ticket Close Button + Modal ---- */
    if (i.isButton() && i.customId === "ticket_close") {
      const modal = new ModalBuilder().setCustomId("ticketCloseModal").setTitle("Ticket schließen");
      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Grund des Schließens")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticketCloseModal") {
      const reason = i.fields.getTextInputValue("reason");
      const ch = i.channel;
      const embed = new EmbedBuilder()
        .setColor("#ff4d4d")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`**Grund:** ${reason}`)
        .setFooter({ text: `${BRAND} Tickets` })
        .setTimestamp();
      try {
        await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { ViewChannel: false, SendMessages: false }).catch(() => {});
      } catch {}
      await ch.send({ embeds: [embed] });
      return i.reply({ content: "✅ Ticket wurde geschlossen.", ephemeral: true });
    }

    /* ---- CREATOR ADD ---- */
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
      modal.addComponents(fields.map(f =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.req)
        )
      ));
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

      const embed = new EmbedBuilder()
        .setColor("#9b5de5")
        .setTitle(title)
        .addFields({ name: "Twitch", value: twitch });
      if (youtube) embed.addFields({ name: "YouTube", value: youtube });
      if (tiktok) embed.addFields({ name: "TikTok", value: tiktok });
      if (instagram) embed.addFields({ name: "Instagram", value: instagram });
      if (code) embed.addFields({ name: "Creator Code", value: code });
      embed.setFooter({ text: `${BRAND} Creator` }).setImage(BANNER_URL);

      const msg = await i.reply({ embeds: [embed], fetchReply: true });
      const arr = JSON.parse(fs.readFileSync(CREATORS_FILE, "utf8"));
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(CREATORS_FILE, JSON.stringify(arr, null, 2));
      return i.followUp({ content: "✅ Creator erstellt!", ephemeral: true });
    }

    /* ---- ORDER SYSTEM ---- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const customer = i.options.getUser("kunde");
      const firstItem = i.options.getString("artikel");
      const firstPrice = i.options.getNumber("preis");
      if (firstPrice <= 0) return i.reply({ content: "❌ Preis muss > 0 sein.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#34c759")
        .setTitle(`🧾 Bestellung von ${customer.tag}`)
        .setDescription(`**🛒 Artikel:** ${firstItem}\n**💶 Preis:** ${formatEUR(firstPrice)}€`)
        .setFooter({ text: `${BRAND} Shop` })
        .setImage(BANNER_URL)
        .setTimestamp();

      const total = firstPrice;
      const btnAdd = new ButtonBuilder().setCustomId("order_add_item").setLabel("Artikel hinzufügen").setEmoji("➕").setStyle(ButtonStyle.Secondary);
      const btnRemove = new ButtonBuilder().setCustomId("order_remove_item").setLabel("Artikel entfernen").setEmoji("➖").setStyle(ButtonStyle.Secondary);
      const btnFinish = new ButtonBuilder().setCustomId("order_finish").setLabel("Bestellung abschließen").setEmoji("✅").setStyle(ButtonStyle.Success);
      const btnPay = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(paypalLink(total)).setLabel(`Jetzt ${formatEUR(total)}€ zahlen 💳`);

      const msg = await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btnAdd, btnRemove, btnFinish, btnPay)],
        fetchReply: true
      });

      activeOrders.set(msg.id, {
        guildId: i.guild.id,
        channelId: i.channel.id,
        customerId: customer.id,
        items: [{ name: firstItem, price: firstPrice }],
        closed: false,
      });
    }

    // ORDER: Add Item (Modal)
    if (i.isButton() && i.customId === "order_add_item") {
      const order = activeOrders.get(i.message.id);
      if (!order || order.closed) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`orderAddItem:${i.message.id}`).setTitle("Artikel hinzufügen");
      const item = new TextInputBuilder().setCustomId("item").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true);
      const price = new TextInputBuilder().setCustomId("price").setLabel("Preis in EUR").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(item), new ActionRowBuilder().addComponents(price));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId.startsWith("orderAddItem:")) {
      const msgId = i.customId.split(":")[1];
      const order = activeOrders.get(msgId);
      if (!order || order.closed) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const name = i.fields.getTextInputValue("item");
      const priceStr = i.fields.getTextInputValue("price");
      const price = Number(priceStr.replace(",", "."));
      if (Number.isNaN(price) || price <= 0) return i.reply({ content: "❌ Ungültiger Preis.", ephemeral: true });

      order.items.push({ name, price });

      // Rebuild embed + buttons
      const total = order.items.reduce((a, b) => a + b.price, 0);
      const desc = order.items.map((it, idx) => `**${idx + 1}.** ${it.name} — ${formatEUR(it.price)}€`).join("\n");
      const embed = new EmbedBuilder()
        .setColor("#34c759")
        .setTitle(`🧾 Bestellung von <@${order.customerId}>`)
        .setDescription(`${desc}\n\n**Gesamt:** ${formatEUR(total)}€`)
        .setFooter({ text: `${BRAND} Shop` })
        .setImage(BANNER_URL)
        .setTimestamp();

      const btnAdd = new ButtonBuilder().setCustomId("order_add_item").setLabel("Artikel hinzufügen").setEmoji("➕").setStyle(ButtonStyle.Secondary);
      const btnRemove = new ButtonBuilder().setCustomId("order_remove_item").setLabel("Artikel entfernen").setEmoji("➖").setStyle(ButtonStyle.Secondary);
      const btnFinish = new ButtonBuilder().setCustomId("order_finish").setLabel("Bestellung abschließen").setEmoji("✅").setStyle(ButtonStyle.Success);
      const btnPay = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(paypalLink(total)).setLabel(`Jetzt ${formatEUR(total)}€ zahlen 💳`);

      await i.message.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btnAdd, btnRemove, btnFinish, btnPay)] });
      return i.reply({ content: "✅ Artikel hinzugefügt.", ephemeral: true });
    }

    // ORDER: Remove Item (Select)
    if (i.isButton() && i.customId === "order_remove_item") {
      const order = activeOrders.get(i.message.id);
      if (!order || order.closed) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });
      if (order.items.length === 0) return i.reply({ content: "ℹ️ Keine Artikel vorhanden.", ephemeral: true });

      const options = order.items.map((it, idx) => ({
        label: `${idx + 1}. ${it.name} (${formatEUR(it.price)}€)`,
        value: String(idx),
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId(`orderRemoveSelect:${i.message.id}`)
        .setPlaceholder("Wähle einen Artikel zum Entfernen")
        .addOptions(options);

      return i.reply({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (i.isStringSelectMenu() && i.customId.startsWith("orderRemoveSelect:")) {
      const msgId = i.customId.split(":")[1];
      const order = activeOrders.get(msgId);
      if (!order || order.closed) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const idx = parseInt(i.values[0], 10);
      if (Number.isNaN(idx) || !order.items[idx]) return i.reply({ content: "❌ Ungültige Auswahl.", ephemeral: true });

      order.items.splice(idx, 1);

      const total = order.items.reduce((a, b) => a + b.price, 0);
      const desc = order.items.length
        ? order.items.map((it, n) => `**${n + 1}.** ${it.name} — ${formatEUR(it.price)}€`).join("\n")
        : "_Keine Artikel_";
      const embed = new EmbedBuilder()
        .setColor("#34c759")
        .setTitle(`🧾 Bestellung von <@${order.customerId}>`)
        .setDescription(`${desc}\n\n**Gesamt:** ${formatEUR(total)}€`)
        .setFooter({ text: `${BRAND} Shop` })
        .setImage(BANNER_URL)
        .setTimestamp();

      const btnAdd = new ButtonBuilder().setCustomId("order_add_item").setLabel("Artikel hinzufügen").setEmoji("➕").setStyle(ButtonStyle.Secondary);
      const btnRemove = new ButtonBuilder().setCustomId("order_remove_item").setLabel("Artikel entfernen").setEmoji("➖").setStyle(ButtonStyle.Secondary);
      const btnFinish = new ButtonBuilder().setCustomId("order_finish").setLabel("Bestellung abschließen").setEmoji("✅").setStyle(ButtonStyle.Success);
      const btnPay = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(paypalLink(total)).setLabel(`Jetzt ${formatEUR(total)}€ zahlen 💳`);

      await i.message.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btnAdd, btnRemove, btnFinish, btnPay)] });
      return i.reply({ content: "🗑️ Artikel entfernt.", ephemeral: true });
    }

    // ORDER: Finish -> führt automatisch Finish-Flow aus
    if (i.isButton() && i.customId === "order_finish") {
      const order = activeOrders.get(i.message.id);
      if (!order || order.closed) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });
      order.closed = true;

      // /finish-Flow (ohne Slash-Aufruf)
      await handleFinishFlow(i, await client.users.fetch(order.customerId));
    }

    /* ---- FINISH (Slash) ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Role-Gate
      const allowed = (process.env.FINISH_ALLOWED_ROLE_IDS || "").split(",").filter(Boolean);
      if (allowed.length && !i.member.roles.cache.some(r => allowed.includes(r.id))) {
        return i.reply({ content: "⛔ Du darfst diesen Befehl nicht verwenden.", ephemeral: true });
      }
      const kunde = i.options.getUser("kunde");
      await handleFinishFlow(i, kunde);
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
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n⏰ **Endet in:** ${dauerStr}\n👥 **Teilnehmer:** 0\n\nKlicke unten, um teilzunehmen!`)
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND} • Endet automatisch` })
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

      // Teilnehmerzahl im Embed updaten
      const old = i.message.embeds?.[0];
      if (old) {
        const updated = EmbedBuilder.from(old);
        const desc = (old.description || "").replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
        updated.setDescription(desc);
        await i.message.edit({ embeds: [updated] });
      }

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

    /* ---- TWITCH STREAM ANNOUNCE ---- */
    if (i.isChatInputCommand() && i.commandName === "streamannounce") {
      const username = (process.env.TWITCH_USERNAME || "").toLowerCase() || "cxlxrized_";
      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${username}-1280x720.jpg`;
      const ch = i.channel;

      const embed = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle(`🔴 ${username} ist jetzt live!`)
        .setDescription(`Kommt vorbei und sagt hallo! ✨\n👉 **https://twitch.tv/${username}**`)
        .setImage(preview)
        .setFooter({ text: "Kandar Streaming" })
        .setTimestamp();

      return ch.send({ embeds: [embed] }).then(() => i.reply({ content: "✅ Stream-Announcement gesendet.", ephemeral: true }));
    }

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

/* ===========================
   Finish-Flow (gemeinsam genutzt)
=========================== */
async function handleFinishFlow(interaction, kundeUser) {
  try {
    // Rolle zuweisen (Customer)
    const customerRoleId = process.env.CUSTOMER_ROLE_ID;
    if (customerRoleId) {
      try {
        const member = await interaction.guild.members.fetch(kundeUser.id);
        await member.roles.add(customerRoleId);
      } catch (err) {
        console.warn("Customer-Rolle konnte nicht vergeben werden:", err.message);
      }
    }

    // Abschluss-Embed + Feedback-Button
    const doneEmbed = new EmbedBuilder()
      .setColor("#e74c3c")
      .setTitle("✅ Bestellung abgeschlossen")
      .setDescription(`Vielen Dank, <@${kundeUser.id}>! 🧾💚\nKlicke unten, um **Feedback** zu geben.`)
      .setImage(BANNER_URL)
      .setFooter({ text: `${BRAND} Shop` })
      .setTimestamp();

    const feedbackBtn = new ButtonBuilder()
      .setCustomId("open_feedback")
      .setLabel("Feedback geben")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary);

    await interaction.reply({ embeds: [doneEmbed], components: [new ActionRowBuilder().addComponents(feedbackBtn)] });

  } catch (err) {
    console.error("Finish-Flow Fehler:", err);
    try {
      await interaction.reply({ content: "❌ Konnte den Abschluss nicht senden.", ephemeral: true });
    } catch {}
  }
}

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

    if (!g.teilnehmer.length) {
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor("#808080")
        .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** 0\n\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: `${BRAND} • Giveaway beendet` });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n🏆 Gewinner: ${winners.join(", ")}\n👥 **Teilnehmer:** ${g.teilnehmer.length}`)
      .setFooter({ text: `${BRAND} • Giveaway beendet` });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}
/* ===========================
   Feedback: Modal + Verkäufer-Auswahl + Versand
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    // Button von Finish-Flow
    if (i.isButton() && i.customId === "open_feedback") {
      const modal = new ModalBuilder().setCustomId("feedbackModal").setTitle("📝 Feedback abgeben");

      const stars = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("Sterne (1-5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const text = new TextInputBuilder()
        .setCustomId("text")
        .setLabel("Dein Feedback (kurz)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(stars),
        new ActionRowBuilder().addComponents(text)
      );
      return i.showModal(modal);
    }

    // Modal Submit -> danach Verkäufer via Select
    if (i.isModalSubmit() && i.customId === "feedbackModal") {
      const starsStr = i.fields.getTextInputValue("stars");
      const text = i.fields.getTextInputValue("text");
      const stars = Math.max(1, Math.min(5, parseInt(starsStr, 10) || 0));

      // Baue Verkäuferliste aus einer Rolle
      const sellerRoleId = process.env.SELLER_ROLE_ID;
      const members = sellerRoleId
        ? (await i.guild.members.fetch()).filter(m => m.roles.cache.has(sellerRoleId))
        : new Map();

      const options = [...members.values()].slice(0, 25).map(m => ({
        label: m.user.tag,
        value: m.user.id
      }));

      if (!options.length) {
        // Fallback: Wenn keine Rolle vorhanden, nimm den Interactor als Verkäufer
        options.push({ label: i.user.tag, value: i.user.id });
      }

      // Speichere Feedback-Zwischendaten ephemer in customId (klein halten)
      const payload = JSON.stringify({ s: stars, t: text }).slice(0, 90); // safety cap

      const select = new StringSelectMenuBuilder()
        .setCustomId(`feedbackSelectSeller:${payload}`)
        .setPlaceholder("Verkäufer auswählen")
        .addOptions(options);

      return i.reply({
        content: "Wähle den Verkäufer:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
    }

    // Verkäufer gewählt -> Feedback Embed an Channel
    if (i.isStringSelectMenu() && i.customId.startsWith("feedbackSelectSeller:")) {
      const raw = i.customId.split("feedbackSelectSeller:")[1];
      let stars = 5, text = "";
      try {
        const obj = JSON.parse(raw);
        stars = obj.s;
        text = obj.t;
      } catch {}

      const sellerId = i.values[0];
      const fbChannelId = process.env.FEEDBACK_CHANNEL_ID;
      const ch = i.guild.channels.cache.get(fbChannelId);

      const starEmojis = "⭐".repeat(stars);
      const fbEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("📝 Neues Feedback")
        .setDescription(
          `**Kunde:** ${i.user}\n` +
          `**Verkäufer:** <@${sellerId}>\n` +
          `**Bewertung:** ${starEmojis}\n\n` +
          `**📣 Feedback:** ${text}\n\n` +
          `🎉 Danke für dein Feedback!`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: `${BRAND} • Feedback` })
        .setTimestamp();

      if (!ch) {
        return i.reply({ content: "❌ Feedback-Channel nicht gefunden.", ephemeral: true });
      }
      await ch.send({ embeds: [fbEmbed] });
      return i.update({ content: "✅ Feedback gesendet!", components: [] });
    }
  } catch (err) {
    console.error("Feedback-Fehler:", err);
  }
});

/* ===========================
   Logging System
=========================== */
// Member
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});
client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});

// Message (gelöscht)
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Nachricht gelöscht").setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`)] });
});

// Channel
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});

// Role
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
});

// Voice
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
   Nuke (bereits registriert)
=========================== */
client.on("interactionCreate", async (i) => {
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
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);