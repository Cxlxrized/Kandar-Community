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
  ComponentType,
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   Constants / Branding
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND_SHOP = "Kandar Shop";
const BRAND_STREAMING = "Kandar Streaming";
const BRAND_COMMUNITY = "Kandar Community";

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

// In-Memory Stores
const ACTIVE_ORDERS = new Map(); // messageId -> { customerId, items:[{name,price}], total }

/* ===========================
   Helpers
=========================== */
const teamRoleIds = (process.env.TEAM_ROLE_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const isTeam = (member) => member.roles.cache.some(r => teamRoleIds.includes(r.id));

const sanitizePayPalName = (s) => (s || "").replace(/\s+/g, "");
const formatEUR = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const toFixed2 = (n) => Math.round(n * 100) / 100;

function parsePrice(input) {
  if (typeof input === "number") return toFixed2(input);
  const s = String(input).replace(",", ".").replace(/[^\d.]/g, "");
  const num = Number(s);
  if (isNaN(num)) return null;
  return toFixed2(num);
}

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
   Slash Commands
=========================== */
const commands = [
  // PayPal
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o =>
      o.setName("betrag").setDescription("Betrag in Euro (z. B. 12.34)").setRequired(true)
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

  // Embed-Builder
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Erstellt ein Embed über ein Modal"),

  // Order-System
  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt/verwaltet eine Bestellung im aktuellen Channel")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Erster Artikel").setRequired(true))
    .addStringOption(o => o.setName("preis").setDescription("Preis (z. B. 19.99)").setRequired(true)),

  // Finish (markiert Kunde, setzt Feedback)
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback anfragen (nur Team)")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),

  // Rename (nur Team) – funktioniert mit $rename Text über Chat ODER /rename
  new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Ticket/Channel umbenennen (nur Team)")
    .addStringOption(o => o.setName("name").setDescription("Neuer Name").setRequired(true)),

  // Twitch announce
  new SlashCommandBuilder()
    .setName("announce_twitch")
    .setDescription("Postet einen Twitch-Announce-Embed"),

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
].map(c => c.toJSON());

// Commands registrieren
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
   Ready: Server Stats + Re-Arm Giveaways
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
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
  }

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
   Message Listener ($rename)
=========================== */
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    const content = msg.content.trim();
    if (!content.startsWith("$rename")) return;
    if (!isTeam(msg.member)) return;

    const newName = content.replace("$rename", "").trim();
    if (!newName) return msg.reply({ content: "⚠️ Bitte einen neuen Namen angeben." });

    await msg.channel.setName(newName);
    await msg.reply({ content: `✅ Channel umbenannt zu **${newName}**.` });
  } catch (e) {
    console.error("Rename error:", e);
  }
});

/* ===========================
   Interaction Handler (ONE listener)
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON ---- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER_URL);

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
        // Immer versuchen hinzuzufügen (idempotent)
        await i.member.roles.add(role);
        return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
      } catch (err) {
        console.error("Verify add role error:", err);
        return i.reply({ content: "❌ Konnte die Verify-Rolle nicht vergeben. Bot-Rechte & Rollen-Hierarchie prüfen.", ephemeral: true });
      }
    }

    /* ---- PAYPAL ---- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag"); // erfordert Zahl mit Cent möglich
      const payMe = sanitizePayPalName(process.env.PAYPAL_ME_NAME || "");
      if (!payMe) return i.reply({ content: "❌ PAYPAL_ME_NAME fehlt in der ENV.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${formatEUR(amount)}** zu zahlen.`)
        .setFooter({ text: BRAND_COMMUNITY });

      const btn = new ButtonBuilder()
        .setLabel(`Jetzt ${formatEUR(amount)} zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(`https://www.paypal.me/${payMe}/${amount}`);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---- EMBED BUILDER (/embed) ---- */
    if (i.isChatInputCommand() && i.commandName === "embed") {
      const modal = new ModalBuilder().setCustomId("customEmbedModal").setTitle("Embed erstellen");

      const color = new TextInputBuilder().setCustomId("color").setLabel("Farbe (Hex, z. B. #ff0000)").setStyle(TextInputStyle.Short).setRequired(false);
      const title = new TextInputBuilder().setCustomId("title").setLabel("Titel").setStyle(TextInputStyle.Short).setRequired(true);
      const footer = new TextInputBuilder().setCustomId("footer").setLabel("Footer (optional)").setStyle(TextInputStyle.Short).setRequired(false);
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
      const footer = i.fields.getTextInputValue("footer");
      const thumb = i.fields.getTextInputValue("thumb");
      const image = i.fields.getTextInputValue("image");

      const embed = new EmbedBuilder().setTitle(title).setColor(color);
      if (footer) embed.setFooter({ text: footer });
      if (thumb) embed.setThumbnail(thumb);
      if (image) embed.setImage(image);
      return i.reply({ embeds: [embed] });
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
        .setImage(BANNER_URL);

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
          { label: "Support Anliegen", value: "Support", emoji: "👥" },
        ]);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // Dropdown -> ggf. Modals/Channel erstellen (Tickets)
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

      // Andere Kategorien: Direkt Channel + Close-Button
      const map = {
        kandar: { title: "✍️ Kandar Bewerbung", cat: "✍️ Kandar Bewerbungen", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter: { title: "✂️ Cutter Bewerbung", cat: "✂️ Cutter Bewerbungen", desc: "Bitte nenne Software & Erfahrung." },
        highteam: { title: "🛠️ Highteam Ticket", cat: "🛠️ Highteam Anliegen", desc: "Beschreibe bitte dein Anliegen." },
        Support: { title: "👥 Support Ticket", cat: "👥 Highteam Anliegen", desc: "Beschreibe bitte dein Anliegen." },
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

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(data.title)
        .setDescription(data.desc)
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close_btn")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // TICKET: Close-Modal öffnen (nur Team)
    if (i.isButton() && i.customId === "ticket_close_btn") {
      if (!isTeam(i.member)) return i.reply({ content: "⛔ Nur Team kann Tickets schließen.", ephemeral: true });

      const modal = new ModalBuilder().setCustomId("ticket_close_modal").setTitle("Ticket schließen");
      const reason = new TextInputBuilder()
        .setCustomId("ticket_close_reason")
        .setLabel("Grund des Schließens")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticket_close_modal") {
      const reason = i.fields.getTextInputValue("ticket_close_reason");
      const ch = i.channel;

      const closedEmbed = new EmbedBuilder()
        .setColor("#ff4444")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`Grund: ${reason}`)
        .setImage(BANNER_URL)
        .setTimestamp();

      await ch.send({ embeds: [closedEmbed] });
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false, ViewChannel: true });
      return i.reply({ content: "✅ Ticket geschlossen.", ephemeral: true });
    }

    /* ---- SHOP/STREAMER Ticket Modal Submit ---- */
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

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setFooter({ text: "Bitte beschreibe dein Anliegen genauer." })
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close_btn")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }

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

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`)
        .setFooter({ text: "Bitte warte auf eine Rückmeldung vom Team." })
        .setImage(BANNER_URL);

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close_btn")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
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

    /* ---- /rename ---- */
    if (i.isChatInputCommand() && i.commandName === "rename") {
      if (!isTeam(i.member)) return i.reply({ content: "⛔ Nur Team kann umbenennen.", ephemeral: true });
      const newName = i.options.getString("name");
      await i.channel.setName(newName);
      return i.reply({ content: `✅ Channel umbenannt zu **${newName}**.`, ephemeral: true });
    }

    /* ---- TWITCH ANNOUNCE ---- */
    if (i.isChatInputCommand() && i.commandName === "announce_twitch") {
      const user = process.env.TWITCH_USERNAME || "cxlxrized_";
      // Twitch-Preview-Template (statisch; kein API-Call)
      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user}-1280x720.jpg`;
      const embed = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle(`🔴 ${user} ist live auf Twitch!`)
        .setDescription(`Kommt vorbei und sagt Hallo 🙌\nhttps://twitch.tv/${user}`)
        .setImage(preview)
        .setFooter({ text: BRAND_STREAMING })
        .setTimestamp();
      return i.reply({ embeds: [embed] });
    }

    /* ---- ORDER SYSTEM (/order) ---- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const customer = i.options.getUser("kunde");
      const firstItem = i.options.getString("artikel");
      const priceStr = i.options.getString("preis");
      const price = parsePrice(priceStr);
      if (price === null) return i.reply({ content: "❌ Ungültiger Preis.", ephemeral: true });

      const title = `🧾 Bestellung von ${customer.username}`;
      const embed = new EmbedBuilder()
        .setColor("#00AA88")
        .setTitle(title)
        .setDescription(`🛒 **Positionen:**\n• ${firstItem} — **${formatEUR(price)}**\n\n**Zwischensumme:** ${formatEUR(price)}\n\n${customer} wir melden uns gleich!`)
        .setFooter({ text: BRAND_SHOP })
        .setImage(BANNER_URL)
        .setTimestamp();

      // Buttons: +Artikel, −Artikel, Bearbeiten (nur Team), Abschließen (nur Team) + PayPal
      const row = await buildOrderButtons(price, i);
      const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });

      ACTIVE_ORDERS.set(msg.id, {
        customerId: customer.id,
        items: [{ name: firstItem, price }],
        total: price,
        channelId: msg.channelId,
      });
    }

    // ORDER: Buttons
    if (i.isButton()) {
      // Prüfen, ob es ein Order-Panel ist
      const order = ACTIVE_ORDERS.get(i.message.id);
      const payMe = sanitizePayPalName(process.env.PAYPAL_ME_NAME || "");
      if (i.customId.startsWith("order_") || i.customId.startsWith("paylink_")) {
        if (!order) {
          return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });
        }
      }

      if (i.customId === "order_add_item") {
        const modal = new ModalBuilder().setCustomId(`order_add_modal_${i.message.id}`).setTitle("🟩 Artikel hinzufügen");
        const name = new TextInputBuilder().setCustomId("item_name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true);
        const price = new TextInputBuilder().setCustomId("item_price").setLabel("Preis (z. B. 9.99)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(price));
        return i.showModal(modal);
      }

      if (i.customId === "order_remove_item") {
        // Modal: zu löschender Artikel (Name oder Index)
        const modal = new ModalBuilder().setCustomId(`order_remove_modal_${i.message.id}`).setTitle("🟥 Artikel entfernen");
        const nameOrIndex = new TextInputBuilder().setCustomId("remove_key").setLabel("Artikelname oder Index (1..n)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nameOrIndex));
        return i.showModal(modal);
      }

      if (i.customId === "order_edit") {
        if (!isTeam(i.member)) return i.reply({ content: "⛔ Nur Team darf Bestellungen bearbeiten.", ephemeral: true });

        // DM an Kunden + Titel ändern
        try {
          const customer = await i.client.users.fetch(order.customerId);
          const dmEmbed = new EmbedBuilder()
            .setColor("#00AA88")
            .setTitle("🛠️ Deine Bestellung wird bearbeitet")
            .setDescription("⏳ Bitte hab etwas Geduld – unser Team kümmert sich jetzt um deine Bestellung.\nWir melden uns gleich bei dir! 🙌")
            .setImage(BANNER_URL)
            .setFooter({ text: BRAND_SHOP })
            .setTimestamp();
          await customer.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch {}

        const newEmbed = EmbedBuilder.from(i.message.embeds[0]);
        newEmbed.setTitle(newEmbed.data.title.replace("Bestellung von", "🛠️ Bestellung in Bearbeitung von") + " ⏳");
        await i.message.edit({ embeds: [newEmbed] });

        return i.reply({ content: "✅ Kunde benachrichtigt & Bestellung auf 'in Bearbeitung' gesetzt.", ephemeral: true });
      }

      if (i.customId === "order_finish") {
        if (!isTeam(i.member)) return i.reply({ content: "⛔ Nur Team darf abschließen.", ephemeral: true });
        // Auto-/finish Flow starten
        await handleFinishFlow(i, order.customerId);
        return;
      }

      if (i.customId.startsWith("paylink_")) {
        // Nur Link Button – keine Aktion nötig
        return i.deferUpdate().catch(() => {});
      }
    }

    // ORDER: Add Modal Submit
    if (i.isModalSubmit() && i.customId.startsWith("order_add_modal_")) {
      const msgId = i.customId.split("order_add_modal_")[1];
      const order = ACTIVE_ORDERS.get(msgId);
      if (!order) return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const itemName = i.fields.getTextInputValue("item_name");
      const itemPriceStr = i.fields.getTextInputValue("item_price");
      const itemPrice = parsePrice(itemPriceStr);
      if (itemPrice === null) return i.reply({ content: "❌ Ungültiger Preis.", ephemeral: true });

      order.items.push({ name: itemName, price: itemPrice });
      order.total = toFixed2(order.items.reduce((a, b) => a + b.price, 0));
      ACTIVE_ORDERS.set(msgId, order);

      const newEmbed = buildOrderEmbed(i.message.embeds[0], order, i, null);
      const row = await buildOrderButtons(order.total, i);

      await i.message.edit({ embeds: [newEmbed], components: [row] });
      return i.reply({ content: `✅ Hinzugefügt: **${itemName}** (${formatEUR(itemPrice)}).`, ephemeral: true });
    }

    // ORDER: Remove Modal Submit
    if (i.isModalSubmit() && i.customId.startsWith("order_remove_modal_")) {
      const msgId = i.customId.split("order_remove_modal_")[1];
      const order = ACTIVE_ORDERS.get(msgId);
      if (!order) return i.reply({ content: "⚠️ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const key = i.fields.getTextInputValue("remove_key").trim();
      let removed;
      if (/^\d+$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        if (idx >= 0 && idx < order.items.length) {
          removed = order.items.splice(idx, 1)[0];
        }
      } else {
        const idx = order.items.findIndex(it => it.name.toLowerCase() === key.toLowerCase());
        if (idx >= 0) removed = order.items.splice(idx, 1)[0];
      }

      if (!removed) return i.reply({ content: "⚠️ Artikel nicht gefunden.", ephemeral: true });

      order.total = toFixed2(order.items.reduce((a, b) => a + b.price, 0));
      ACTIVE_ORDERS.set(msgId, order);

      const newEmbed = buildOrderEmbed(i.message.embeds[0], order, i, null);
      const row = await buildOrderButtons(order.total, i);

      await i.message.edit({ embeds: [newEmbed], components: [row] });
      return i.reply({ content: `🗑️ Entfernt: **${removed.name}** (${formatEUR(removed.price)}).`, ephemeral: true });
    }

    /* ---- /finish (nur Team) ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      if (!isTeam(i.member)) return i.reply({ content: "⛔ Nur Team darf abschließen.", ephemeral: true });
      const customer = i.options.getUser("kunde");
      await handleFinishFlow(i, customer.id);
      return;
    }

    // FEEDBACK Button -> Modal
    if (i.isButton() && i.customId === "feedback_start") {
      const modal = new ModalBuilder().setCustomId("feedback_modal_step1").setTitle("⭐ Feedback abgeben");
      const stars = new TextInputBuilder().setCustomId("fb_stars").setLabel("Sterne (1-5)").setStyle(TextInputStyle.Short).setRequired(true);
      const text = new TextInputBuilder().setCustomId("fb_text").setLabel("Feedback-Text").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(stars), new ActionRowBuilder().addComponents(text));
      return i.showModal(modal);
    }

    // FEEDBACK Modal Submit -> Verkäufer-Auswahl Menü
    if (i.isModalSubmit() && i.customId === "feedback_modal_step1") {
      const stars = parseInt(i.fields.getTextInputValue("fb_stars"), 10);
      const text = i.fields.getTextInputValue("fb_text");
      if (!(stars >= 1 && stars <= 5)) return i.reply({ content: "⚠️ Sterne bitte 1-5.", ephemeral: true });

      // Staff auswählen (ohne ID manuell) – build select mit Team-Rollen-Mitgliedern
      const staff = i.guild.members.cache.filter(m => isTeam(m));
      const options = staff.first(25).map(m =>
        new StringSelectMenuOptionBuilder().setLabel(m.displayName).setValue(m.user.id).setDescription(m.user.tag)
      );
      if (options.length === 0) return i.reply({ content: "❌ Keine Teammitglieder gefunden.", ephemeral: true });

      // Store temp in message component state via customId
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`feedback_pick_seller_${stars}_${Buffer.from(text).toString("base64").slice(0, 900)}`)
        .setPlaceholder("Verkäufer auswählen")
        .addOptions(options);

      return i.reply({
        content: "Bitte wähle den Verkäufer:",
        components: [new ActionRowBuilder().addComponents(sel)],
        ephemeral: true
      });
    }

    // FEEDBACK Verkäufer gewählt -> senden
    if (i.isStringSelectMenu() && i.customId.startsWith("feedback_pick_seller_")) {
      const parts = i.customId.split("_");
      const stars = parseInt(parts[3], 10); // feedback_pick_seller_{stars}_{b64}
      const b64 = parts.slice(4).join("_");
      const text = Buffer.from(b64, "base64").toString();

      const sellerId = i.values[0];
      const ch = i.guild.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID);
      if (!ch) return i.reply({ content: "❌ Feedback-Channel nicht gefunden.", ephemeral: true });

      const starEmojis = "⭐".repeat(stars) + "☆".repeat(5 - stars);
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("📝 Neues Feedback eingegangen! 🎯")
        .setDescription(`**Verkäufer:** <@${sellerId}>\n**Kunde:** ${i.user}\n**Bewertung:** ${starEmojis}\n\n**Feedback:**\n${text}\n\n🎉 Danke für deine Rückmeldung!`)
        .setFooter({ text: BRAND_SHOP })
        .setImage(BANNER_URL)
        .setTimestamp();
      await ch.send({ embeds: [embed] });
      return i.update({ content: "✅ Danke! Dein Feedback wurde gesendet.", components: [] });
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
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n👥 **Teilnehmer:** 0\n⏰ **Endet in:** ${dauerStr}\n\nKlicke unten, um teilzunehmen!`)
        .setImage(BANNER_URL)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch" });

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

      // Teilnehmerzahl im Embed aktualisieren
      const old = i.message.embeds[0];
      const newEmbed = EmbedBuilder.from(old);
      const newDesc = old.description.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
      newEmbed.setDescription(newDesc);
      await i.message.edit({ embeds: [newEmbed] });

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
        .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** 0\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** ${g.teilnehmer.length}\n🏆 Gewinner: ${winners.join(", ")}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* ===========================
   Finish Flow (assign role + feedback)
=========================== */
async function handleFinishFlow(i, customerId) {
  try {
    // Rolle vergeben
    const customerRole = i.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
    const member = await i.guild.members.fetch(customerId).catch(() => null);
    if (customerRole && member) {
      try { await member.roles.add(customerRole); } catch {}
    }

    // Feedback Button unter eine Info
    const info = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("✅ Bestellung abgeschlossen")
      .setDescription(`Danke für deinen Einkauf! 😄\nBitte gib uns dein Feedback – das hilft uns sehr!`)
      .setImage(BANNER_URL)
      .setFooter({ text: BRAND_SHOP });

    const fbBtn = new ButtonBuilder()
      .setCustomId("feedback_start")
      .setLabel("Feedback abgeben")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary);

    await i.channel.send({ content: `<@${customerId}>`, embeds: [info], components: [new ActionRowBuilder().addComponents(fbBtn)] });
    return i.reply({ content: "✅ Abgeschlossen. Kunde markiert & Feedback angefordert.", ephemeral: true });
  } catch (e) {
    console.error("finish flow error:", e);
    return i.reply({ content: "❌ Konnte Finish nicht durchführen.", ephemeral: true });
  }
}

/* ===========================
   Order helpers
=========================== */
function buildOrderEmbed(oldEmbed, order, interaction, note) {
  const lines = order.items.map((it, idx) => `• ${it.name} — **${formatEUR(it.price)}**`).join("\n");
  const title = oldEmbed?.title || `🧾 Bestellung von ${interaction.user.username}`;
  const embed = new EmbedBuilder()
    .setColor("#00AA88")
    .setTitle(title)
    .setDescription(`🛒 **Positionen:**\n${lines || "—"}\n\n**Zwischensumme:** ${formatEUR(order.total)}${note ? `\n${note}` : ""}`)
    .setFooter({ text: BRAND_SHOP })
    .setImage(BANNER_URL)
    .setTimestamp();
  return embed;
}

async function buildOrderButtons(total, i) {
  const payMe = sanitizePayPalName(process.env.PAYPAL_ME_NAME || "");
  const linkBtn = new ButtonBuilder()
    .setLabel(`Jetzt ${formatEUR(total)} zahlen`)
    .setStyle(ButtonStyle.Link)
    .setURL(`https://www.paypal.me/${payMe}/${total}`)
    .setDisabled(!payMe);

  const addBtn = new ButtonBuilder().setCustomId("order_add_item").setLabel("Artikel hinzufügen").setEmoji("➕").setStyle(ButtonStyle.Success);
  const remBtn = new ButtonBuilder().setCustomId("order_remove_item").setLabel("Artikel entfernen").setEmoji("➖").setStyle(ButtonStyle.Secondary);

  const editBtn = new ButtonBuilder().setCustomId("order_edit").setLabel("Bestellung bearbeiten").setEmoji("🛠️").setStyle(ButtonStyle.Primary);
  const finishBtn = new ButtonBuilder().setCustomId("order_finish").setLabel("Bestellung abschließen").setEmoji("✅").setStyle(ButtonStyle.Danger);

  // Team-spezifisches nicht ausgrauen – Permission wird beim Klick geprüft
  return new ActionRowBuilder().addComponents(addBtn, remBtn, editBtn, finishBtn, linkBtn);
}

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
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);