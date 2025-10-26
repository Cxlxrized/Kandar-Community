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
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* =========================================================
   Grundsetup + Daten
========================================================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const GIVEAWAY_FILE = "./data/giveaways.json";
const CREATORS_FILE = "./data/creators.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");

const BRAND = "🌌 Kandar Community";
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

/* =========================================================
   Slash-Commands
========================================================= */
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o => o.setName("betrag").setDescription("Betrag in Euro (z. B. 12.50)").setRequired(true)),

  new SlashCommandBuilder().setName("panel").setDescription("Sendet das Ticket-Panel"),
  new SlashCommandBuilder().setName("verifymsg").setDescription("Sendet die Verify-Nachricht"),
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht viele Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System verwalten")
    .addSubcommand(s => s.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")),

  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstelle eine neue Bestellung")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde der Bestellung").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis in Euro (z. B. 12.50)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Schließt eine Bestellung / Ticket ab")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

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

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Erstelle ein benutzerdefiniertes Embed über ein Modal"),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
  { body: commands }
);
console.log("✅ Slash Commands registriert!");


/* =========================================================
   Hilfsfunktionen
========================================================= */
const parseDuration = str => {
  if (!str) return 0;
  const m = String(str).toLowerCase().match(/^(\d+d)?(\d+h)?(\d+m)?$/);
  if (!m) return 0;
  let ms = 0;
  if (m[1]) ms += parseInt(m[1]) * 86400000;
  if (m[2]) ms += parseInt(m[2]) * 3600000;
  if (m[3]) ms += parseInt(m[3]) * 60000;
  return ms;
};
const formatEUR = num => num.toFixed(2).replace(".", ",");
const paypalLink = total => `https://www.paypal.com/paypalme/${process.env.PAYPAL_USER}/${total}`;
const loadGiveaways = () => JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
const saveGiveaways = data => fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(data, null, 2));

/* =========================================================
   Ready-Event + Server-Stats
========================================================= */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  const catName = "📊 Server Stats";
  let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
  if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

  const stats = { m: "🧍‍♂️ Mitglieder", o: "💻 Online", b: "🤖 Bots", x: "💎 Boosts" };
  for (const n of Object.values(stats))
    if (!guild.channels.cache.find(c => c.parentId === cat.id && c.name.startsWith(n)))
      await guild.channels.create({
        name: `${n}: 0`,
        type: ChannelType.GuildVoice,
        parent: cat.id,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
      });

  const update = async () => {
    const m = guild.members.cache;
    const o = m.filter(x => x.presence && x.presence.status !== "offline").size;
    const b = m.filter(x => x.user.bot).size;
    const h = m.size - b;
    const x = guild.premiumSubscriptionCount || 0;
    const find = s => guild.channels.cache.find(c => c.name.startsWith(s));
    if (find(stats.m)) await find(stats.m).setName(`${stats.m}: ${h}`);
    if (find(stats.o)) await find(stats.o).setName(`${stats.o}: ${o}`);
    if (find(stats.b)) await find(stats.b).setName(`${stats.b}: ${b}`);
    if (find(stats.x)) await find(stats.x).setName(`${stats.x}: ${x}`);
  };
  update();
  setInterval(update, 300000);

  const giveaways = loadGiveaways();
  for (const g of giveaways.filter(x => !x.beendet)) {
    const rest = g.endZeit - Date.now();
    if (rest <= 0) endGiveaway(g.messageId).catch(() => {});
    else setTimeout(() => endGiveaway(g.messageId).catch(() => {}), rest);
  }
  console.log("📊 Server-Stats aktiv – Giveaways reaktiviert.");
});
/* =========================================================
   Runtime-State (Bestellungen)
========================================================= */
const ORDERS_FILE = "./data/orders.json";
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "{}");
const activeOrders = new Map(); // messageId -> { guildId, channelId, customerId, items:[{name,price}], total }

const loadOrders = () => {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); } catch { return {}; }
};
const saveOrders = () => {
  const obj = {};
  for (const [k, v] of activeOrders.entries()) obj[k] = v;
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(obj, null, 2));
};

// beim Start Orders rehydraten (falls Messages noch existieren)
client.once("ready", async () => {
  const raw = loadOrders();
  for (const [msgId, o] of Object.entries(raw)) {
    activeOrders.set(msgId, o);
  }
});

/* =========================================================
   TICKET UI Hilfen
========================================================= */
const ticketCloseRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger)
);

const isTeam = (member) => {
  const ids = (process.env.TEAM_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return false;
  return ids.some(id => member.roles.cache.has(id));
};

/* =========================================================
   Interaction Handler (Fortsetzung)
========================================================= */
client.on("interactionCreate", async (i) => {
  try {
    /* ---------- /embed (Modal öffnen) ---------- */
    if (i.isChatInputCommand() && i.commandName === "embed") {
      const modal = new ModalBuilder().setCustomId("make_embed_modal").setTitle("Embed erstellen");
      const color = new TextInputBuilder().setCustomId("color").setLabel("Farbe (Hex z.B. #ff0000) - optional").setStyle(TextInputStyle.Short).setRequired(false);
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

    if (i.isModalSubmit() && i.customId === "make_embed_modal") {
      const color = i.fields.getTextInputValue("color")?.trim() || "#9B5DE5";
      const title = i.fields.getTextInputValue("title").trim();
      const footer = i.fields.getTextInputValue("footer")?.trim();
      const thumb = i.fields.getTextInputValue("thumb")?.trim();
      const image = i.fields.getTextInputValue("image")?.trim();

      const e = new EmbedBuilder().setColor(color).setTitle(title).setFooter({ text: BRAND }).setTimestamp();
      if (footer) e.setFooter({ text: footer });
      if (thumb) e.setThumbnail(thumb);
      if (image) e.setImage(image);
      await i.reply({ embeds: [e] });
    }

    /* ---------- /panel (Ticket-Panel) ---------- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Für Grafiker\n` +
          `✂️ **Cutter Bewerbung** – Für Videoeditoren\n` +
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n` +
          `👥 **Support Anliegen** – Support vom Team`
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
          { label: "Support Anliegen", value: "support", emoji: "👥" },
        ]);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // Ticket-Auswahl
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // Shop → Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
        const payment = new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode (PayPal, Überweisung...)").setStyle(TextInputStyle.Short).setRequired(true);
        const item = new TextInputBuilder().setCustomId("item").setLabel("Artikel / Produktname").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(payment), new ActionRowBuilder().addComponents(item));
        return i.showModal(modal);
      }

      // Streamer → Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        const follower = new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true);
        const avg = new TextInputBuilder().setCustomId("avg_viewer").setLabel("Durchschnittliche Viewer").setStyle(TextInputStyle.Short).setRequired(true);
        const twitch = new TextInputBuilder().setCustomId("twitch_link").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(follower), new ActionRowBuilder().addComponents(avg), new ActionRowBuilder().addComponents(twitch));
        return i.showModal(modal);
      }

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

      const embed = new EmbedBuilder().setColor("#00FF00").setTitle(data.title).setDescription(data.desc);
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketCloseRow] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // Shop Modal submit
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
        .setFooter({ text: BRAND });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketCloseRow] });
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // Streamer Modal submit
    if (i.isModalSubmit() && i.customId === "streamerTicketModal") {
      const follower = i.fields.getTextInputValue("follower");
      const avg = i.fields.getTextInputValue("avg_viewer");
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
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avg}\n🔗 **Twitch:** ${twitch}`)
        .setFooter({ text: BRAND });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketCloseRow] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---------- Ticket schließen (Button + Modal) ---------- */
    if (i.isButton() && i.customId === "ticket_close") {
      if (!isTeam(i.member)) return i.reply({ content: "🚫 Nur Team-Mitglieder können Tickets schließen.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId("ticket_close_reason").setTitle("Ticket schließen – Grund");
      const reason = new TextInputBuilder().setCustomId("reason").setLabel("Grund").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticket_close_reason") {
      const reason = i.fields.getTextInputValue("reason");
      const ch = i.channel;
      // Kanal sperren
      await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
      await ch.send({
        embeds: [new EmbedBuilder()
          .setColor("#ff5555")
          .setTitle("🔒 Ticket geschlossen")
          .setDescription(`📌 **Grund:** ${reason}\n👤 **Von:** ${i.user}`)
          .setFooter({ text: BRAND })
          .setTimestamp()
        ],
        components: [],
      });
      return i.reply({ content: "✅ Ticket geschlossen.", ephemeral: true });
    }

    /* ---------- /paypal ---------- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (isNaN(amount) || amount <= 0) return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });
      const link = paypalLink(amount.toFixed(2));
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${formatEUR(amount)}€** zu zahlen.`)
        .setFooter({ text: BRAND });
      const btn = new ButtonBuilder().setLabel(`Jetzt ${formatEUR(amount)}€ zahlen`).setStyle(ButtonStyle.Link).setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---------- /order ---------- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const customer = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preis = i.options.getNumber("preis");
      if (!customer || !artikel || isNaN(preis)) return i.reply({ content: "⚠️ Ungültige Eingaben.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#f1c40f")
        .setTitle(`🛒 Bestellung von ${customer.username}`)
        .setDescription(`🧾 **Artikel:** ${artikel}\n💸 **Preis:** ${formatEUR(preis)}€`)
        .setFooter({ text: "Kandar Shop" })
        .setImage(BANNER_URL)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("order_add").setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("order_remove").setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("order_finish").setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success),
      );

      const second = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("order_edit").setLabel("🛠️ Bestellung bearbeiten").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("order_pay").setLabel(`💳 Zahlen: ${formatEUR(preis)}€`).setStyle(ButtonStyle.Link).setURL(paypalLink(preis.toFixed(2)))
      );

      const msg = await i.reply({ embeds: [embed], components: [row, second], fetchReply: true });

      activeOrders.set(msg.id, {
        guildId: i.guild.id,
        channelId: i.channel.id,
        customerId: customer.id,
        items: [{ name: artikel, price: preis }],
      });
      saveOrders();
    }

    // Order: Add/Remove/Edit/Finish/Pay
    const ensureOrder = (interaction) => {
      const order = activeOrders.get(interaction.message.id);
      if (!order) return null;
      return order;
    };

    const rebuildOrderEmbed = async (msg, order) => {
      const total = order.items.reduce((a, b) => a + b.price, 0);
      const list = order.items.map((it, idx) => `• ${it.name} — ${formatEUR(it.price)}€`).join("\n");
      const e = new EmbedBuilder()
        .setColor("#f1c40f")
        .setTitle(`🛒 Bestellung von ${msg.guild.members.cache.get(order.customerId)?.user.username || "Kunde"}`)
        .setDescription(list || "—")
        .addFields({ name: "Summe", value: `💰 **${formatEUR(total)}€**`, inline: true })
        .setFooter({ text: "Kandar Shop" })
        .setImage(BANNER_URL)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("order_add").setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("order_remove").setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("order_finish").setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success),
      );
      const second = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("order_edit").setLabel("🛠️ Bestellung bearbeiten").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setLabel(`💳 Zahlen: ${formatEUR(total)}€`).setStyle(ButtonStyle.Link).setURL(paypalLink(total.toFixed(2)))
      );
      await msg.edit({ embeds: [e], components: [row, second] });
    };

    // Add
    if (i.isButton() && i.customId === "order_add") {
      const order = ensureOrder(i);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`order_add_modal:${i.message.id}`).setTitle("➕ Artikel hinzufügen");
      const name = new TextInputBuilder().setCustomId("name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true);
      const price = new TextInputBuilder().setCustomId("price").setLabel("Preis (z. B. 12.50)").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(price));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId.startsWith("order_add_modal:")) {
      const msgId = i.customId.split(":")[1];
      const order = activeOrders.get(msgId);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const name = i.fields.getTextInputValue("name");
      const price = parseFloat(i.fields.getTextInputValue("price").replace(",", "."));
      if (!name || isNaN(price) || price <= 0) return i.reply({ content: "⚠️ Ungültige Angaben.", ephemeral: true });

      order.items.push({ name, price });
      saveOrders();
      const msg = await i.channel.messages.fetch(msgId);
      await rebuildOrderEmbed(msg, order);
      return i.reply({ content: "✅ Artikel hinzugefügt.", ephemeral: true });
    }

    // Remove
    if (i.isButton() && i.customId === "order_remove") {
      const order = ensureOrder(i);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      if (!order.items.length) return i.reply({ content: "⚠️ Es gibt keine Artikel zum Entfernen.", ephemeral: true });

      // kleines Select Modal zum Entfernen
      const modal = new ModalBuilder().setCustomId(`order_remove_modal:${i.message.id}`).setTitle("➖ Artikel entfernen");
      const name = new TextInputBuilder().setCustomId("name").setLabel("Genaue Artikelbezeichnung zum Entfernen").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(name));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId.startsWith("order_remove_modal:")) {
      const msgId = i.customId.split(":")[1];
      const order = activeOrders.get(msgId);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      const name = i.fields.getTextInputValue("name").trim().toLowerCase();
      const idx = order.items.findIndex(x => x.name.toLowerCase() === name);
      if (idx === -1) return i.reply({ content: "⚠️ Artikel nicht gefunden.", ephemeral: true });

      order.items.splice(idx, 1);
      saveOrders();
      const msg = await i.channel.messages.fetch(msgId);
      await rebuildOrderEmbed(msg, order);
      return i.reply({ content: "✅ Artikel entfernt.", ephemeral: true });
    }

    // Edit (Team only)
    if (i.isButton() && i.customId === "order_edit") {
      if (!isTeam(i.member)) return i.reply({ content: "🚫 Nur Team kann Bestellungen bearbeiten.", ephemeral: true });

      const order = ensureOrder(i);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      // Kunde informieren (DM)
      const user = await client.users.fetch(order.customerId).catch(() => null);
      if (user) {
        const e = new EmbedBuilder()
          .setColor("#f1c40f")
          .setTitle("⏳ Deine Bestellung wird bearbeitet")
          .setDescription("🛠️ Unser Team hat mit der Bearbeitung deiner Bestellung begonnen.\nBitte hab einen Moment Geduld. 💙")
          .setImage(BANNER_URL)
          .setFooter({ text: BRAND })
          .setTimestamp();
        user.send({ embeds: [e] }).catch(() => {});
      }

      // Titel → „in Bearbeitung“ mit anim. Ladebalken
      const msg = i.message;
      const orderObj = activeOrders.get(msg.id);
      await rebuildOrderEmbed(msg, orderObj);
      const edited = EmbedBuilder.from(msg.embeds[0]);
      edited.setTitle(`${edited.data.title}  ⏳`);
      await msg.edit({ embeds: [edited], components: msg.components });
      return i.reply({ content: "🛠️ Kunde informiert. Bestellung auf 'in Bearbeitung' gesetzt.", ephemeral: true });
    }

    // Finish -> führt /finish-Flow aus
    if (i.isButton() && i.customId === "order_finish") {
      const order = ensureOrder(i);
      if (!order) return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

      // Finish-Flow
      await handleFinish(i, order.customerId);
      // Bestellung aus Map entfernen
      activeOrders.delete(i.message.id);
      saveOrders();
    }

    /* ---------- /finish ---------- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Falls im Ticket / Channel: markiere letzten Autor? Wir fragen nicht ab, nutzen Channel-Mentioned user?
      // Hier: wir suchen letzten erwähnten User oder Thread starter ist nicht trivial → einfacher Button-Flow
      // Für Konsistenz: nur Feedback-Button anzeigen im aktuellen Kanal für den letzten sichtbaren User
      const target = i.options.getUser("user") || null; // optional; du kannst später erweitern
      await handleFinish(i, target?.id);
    }

    /* ---------- Giveaways ---------- */
    if (i.isChatInputCommand() && i.commandName === "giveaway") {
      const preis = i.options.getString("preis");
      const dauerStr = i.options.getString("dauer");
      const gewinner = i.options.getInteger("gewinner");
      if (!gewinner || gewinner < 1) return i.reply({ content: "⚠️ Bitte gib eine gültige Gewinneranzahl an!", ephemeral: true });

      const dauer = parseDuration(dauerStr);
      if (!dauer || dauer <= 0) return i.reply({ content: "⚠️ Ungültige Dauer (z. B. 1d2h30m)", ephemeral: true });

      const endZeit = Date.now() + dauer;

      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n👥 **Teilnehmer:** 0\n⏰ **Endet in:** ${dauerStr}\n\nKlicke unten, um teilzunehmen!`)
        .setImage(BANNER_URL)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch" });

      const btn = new ButtonBuilder().setCustomId("giveaway_join").setLabel("Teilnehmen 🎉").setStyle(ButtonStyle.Primary);

      const msg = await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)], fetchReply: true });

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
      if (g.teilnehmer.includes(i.user.id)) return i.reply({ content: "⚠️ Du bist bereits dabei!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      saveGiveaways(giveaways);

      // Embed Teilnehmer-Anzahl updaten
      const e = EmbedBuilder.from(i.message.embeds[0]);
      const desc = e.data.description || "";
      const updated = desc.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
      e.setDescription(updated);
      await i.message.edit({ embeds: [e] });

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

/* =========================================================
   Finish / Feedback Flow (wird auch von order_finish genutzt)
========================================================= */
async function handleFinish(interaction, customerIdFallback = null) {
  // Customer Rolle
  const customerRole = interaction.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
  let targetUser = customerIdFallback ? await interaction.guild.members.fetch(customerIdFallback).catch(() => null) : null;

  if (!targetUser) {
    // versuche: ersten erwähnten im Kanal finden (zur Not Ersteller nicht verfügbar)
    targetUser = interaction.member;
  }

  if (customerRole && targetUser) {
    await targetUser.roles.add(customerRole).catch(() => {});
  }

  // Feedback-Button unter aktueller Nachricht / separat posten
  const feedbackBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("feedback_open").setLabel("📝 Feedback geben").setStyle(ButtonStyle.Success)
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#e74c3c")
        .setTitle("✅ Bestellung / Ticket abgeschlossen")
        .setDescription(`Danke ${targetUser}, wir freuen uns über dein Feedback!`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Shop" })
    ],
    components: [feedbackBtn],
  });
}

client.on("interactionCreate", async (i) => {
  if (i.isButton() && i.customId === "feedback_open") {
    const modal = new ModalBuilder().setCustomId("feedback_modal").setTitle("📝 Feedback abgeben");

    const stars = new TextInputBuilder().setCustomId("stars").setLabel("⭐ Sterne (1-5)").setStyle(TextInputStyle.Short).setRequired(true);
    const text = new TextInputBuilder().setCustomId("text").setLabel("Dein Feedback (kurz)").setStyle(TextInputStyle.Paragraph).setRequired(true);
    const seller = new TextInputBuilder().setCustomId("seller").setLabel("Verkäufer (Name oder @)").setStyle(TextInputStyle.Short).setRequired(true); // Auswahl via Namen — ohne ID-Suche

    modal.addComponents(
      new ActionRowBuilder().addComponents(stars),
      new ActionRowBuilder().addComponents(text),
      new ActionRowBuilder().addComponents(seller)
    );
    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "feedback_modal") {
    const starsRaw = i.fields.getTextInputValue("stars").trim();
    const text = i.fields.getTextInputValue("text").trim();
    const seller = i.fields.getTextInputValue("seller").trim();
    let stars = parseInt(starsRaw, 10);
    if (isNaN(stars) || stars < 1) stars = 1;
    if (stars > 5) stars = 5;
    const starsEmoji = "⭐".repeat(stars);

    const e = new EmbedBuilder()
      .setColor("#e74c3c")
      .setTitle("📝 Neues Feedback eingegangen")
      .setDescription(`**Kunde:** ${i.user}\n**Verkäufer:** ${seller}\n**Bewertung:** ${starsEmoji}\n\n**Kommentar:**\n${text}`)
      .setImage(BANNER_URL)
      .setFooter({ text: "Kandar Shop • ❤️ Danke für dein Feedback!" })
      .setTimestamp();

    const ch = i.guild.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID);
    if (ch) await ch.send({ embeds: [e] });
    return i.reply({ content: "✅ Danke! Dein Feedback wurde übermittelt.", ephemeral: true });
  }
});

/* =========================================================
   $rename (nur Team in Ticket-Kanälen)
========================================================= */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("$rename ")) return;
  if (!isTeam(msg.member)) return msg.reply("🚫 Nur Team-Mitglieder.");
  const newName = msg.content.slice(8).trim();
  if (!newName) return msg.reply("⚠️ Bitte neuen Namen angeben.");
  try {
    await msg.channel.setName(newName);
    await msg.reply(`✅ Kanal umbenannt zu **${newName}**.`);
  } catch {
    await msg.reply("❌ Konnte Kanal nicht umbenennen.");
  }
});

/* =========================================================
   Verify-Panel: Rolle immer vergeben
========================================================= */
client.on("interactionCreate", async (i) => {
  if (i.isChatInputCommand() && i.commandName === "verifymsg") {
    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("✅ Verifizierung")
      .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
      .setImage(BANNER_URL);

    const button = new ButtonBuilder().setCustomId("verify_button").setLabel("Verifizieren").setStyle(ButtonStyle.Success);
    return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
  }

  if (i.isButton() && i.customId === "verify_button") {
    const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
    try {
      await i.member.roles.add(role);
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
    } catch {
      return i.reply({ content: "❌ Konnte die Verify-Rolle nicht vergeben. Bitte prüfe Bot-Rechte & Rollen-Hierarchie.", ephemeral: true });
    }
  }
});

/* =========================================================
   Creator: /creator add (Modal)
========================================================= */
client.on("interactionCreate", async (i) => {
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
});

/* =========================================================
   Giveaways: Ende / Update
========================================================= */
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
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** ${g.teilnehmer.length}\n🏆 **Gewinner:** ${winners.join(", ")}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* =========================================================
   Twitch Announce (manuell per Funktionsaufruf)
========================================================= */
async function announceTwitchLive(channel) {
  const user = process.env.TWITCH_USERNAME || "cxlxrized_";
  const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.toLowerCase()}-640x360.jpg`;
  const e = new EmbedBuilder()
    .setColor("#9146FF")
    .setTitle(`🔴 ${user} ist jetzt LIVE!`)
    .setDescription("Komm vorbei und sag hi! 💜")
    .setImage(preview)
    .setFooter({ text: "Kandar Streaming" })
    .setTimestamp();
  await channel.send({ embeds: [e] });
}

/* =========================================================
   Logs + Nuke
========================================================= */
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

// /nuke
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

/* =========================================================
   Login
========================================================= */
client.login(process.env.DISCORD_TOKEN);