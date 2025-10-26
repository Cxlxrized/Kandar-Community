// index.js — Teil 1 von 2
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
  Colors,
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   Client + Initialisierung
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

const BANNER_URL =
  "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

/* ===========================
   In-Memory Stores
=========================== */
const orderSessions = new Map();

/* ===========================
   Slash-Commands Definition
=========================== */
const commands = [
  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Sendet das Ticket-Panel"),

  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Link (Cent-Beträge erlaubt)")
    .addNumberOption(o =>
      o
        .setName("betrag")
        .setDescription("Betrag in Euro, z. B. 12.99")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Neue Bestellung (ohne Ticket)")
    .addUserOption(o =>
      o.setName("kunde").setDescription("Kunde auswählen").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("artikel").setDescription("Erstartikel").setRequired(true)
    )
    .addNumberOption(o =>
      o.setName("preis").setDescription("Preis in €").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Bestellung abschließen & Feedback starten")
    .addUserOption(o =>
      o.setName("kunde").setDescription("Kund*in").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator hinzufügen")
    .addSubcommand(s => s.setName("add").setDescription("Creator-Panel erstellen")),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Startet ein neues Giveaway")
    .addStringOption(o =>
      o.setName("preis").setDescription("Preis").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("dauer").setDescription("z. B. 1d2h30m").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("gewinner").setDescription("Anzahl Gewinner").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Zieht neue Gewinner")
    .addStringOption(o =>
      o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beendet ein Giveaway vorzeitig")
    .addStringOption(o =>
      o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Öffnet Modal zum Erstellen eines Embeds"),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Leert aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("streamannounce")
    .setDescription("Postet Twitch-Stream-Ankündigung"),
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
    console.log("✅ Slash-Commands registriert!");
  } catch (e) {
    console.error("❌ Fehler:", e);
  }
})();

/* ===========================
   Utility-Funktionen
=========================== */
const loadGiveaways = () => JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
const saveGiveaways = arr =>
  fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(arr, null, 2));

function parseDuration(str) {
  const m = String(str).toLowerCase().match(/^(\d+d)?(\d+h)?(\d+m)?$/);
  if (!m) return 0;
  let ms = 0;
  if (m[1]) ms += parseInt(m[1]) * 86400000;
  if (m[2]) ms += parseInt(m[2]) * 3600000;
  if (m[3]) ms += parseInt(m[3]) * 60000;
  return ms;
}
const eurToCents = n => Math.round(Number(n) * 100);
const centsToEur = c => (c / 100).toFixed(2).replace(".", ",");

/* ===========================
   Server-Stats + Welcome/Boost
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // 📊 Stats-Kategorie
  let cat = guild.channels.cache.find(
    c => c.name === "📊 Server Stats" && c.type === ChannelType.GuildCategory
  );
  if (!cat)
    cat = await guild.channels.create({
      name: "📊 Server Stats",
      type: ChannelType.GuildCategory,
    });

  const names = {
    members: "🧍‍♂️ Mitglieder",
    online: "💻 Online",
    bots: "🤖 Bots",
    boosts: "💎 Boosts",
  };

  for (const label of Object.values(names)) {
    if (!guild.channels.cache.find(c => c.name.startsWith(label)))
      await guild.channels.create({
        name: `${label}: 0`,
        type: ChannelType.GuildVoice,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
  }

  const updateStats = async () => {
    const m = await guild.members.fetch();
    const bots = m.filter(x => x.user.bot).size;
    const humans = m.size - bots;
    const online = m.filter(
      x => x.presence && x.presence.status !== "offline"
    ).size;
    const boosts = guild.premiumSubscriptionCount || 0;

    const chans = {
      members: guild.channels.cache.find(c => c.name.startsWith(names.members)),
      online: guild.channels.cache.find(c => c.name.startsWith(names.online)),
      bots: guild.channels.cache.find(c => c.name.startsWith(names.bots)),
      boosts: guild.channels.cache.find(c => c.name.startsWith(names.boosts)),
    };
    if (chans.members)
      chans.members.setName(`${names.members}: ${humans}`).catch(() => {});
    if (chans.online)
      chans.online.setName(`${names.online}: ${online}`).catch(() => {});
    if (chans.bots)
      chans.bots.setName(`${names.bots}: ${bots}`).catch(() => {});
    if (chans.boosts)
      chans.boosts.setName(`${names.boosts}: ${boosts}`).catch(() => {});
  };
  updateStats();
  setInterval(updateStats, 300000);

  // offene Giveaways reaktivieren
  for (const g of loadGiveaways().filter(x => !x.beendet)) {
    const rest = g.endZeit - Date.now();
    setTimeout(() => endGiveaway(g.messageId).catch(() => {}), Math.max(rest, 0));
  }
  console.log("📊 Stats & Giveaways geladen.");
});

// Welcome-Embed
client.on("guildMemberAdd", m => {
  const ch = m.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const e = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${m}, schön dass du da bist! 🎉`)
    .setImage(BANNER_URL)
    .setThumbnail(m.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();
  ch.send({ embeds: [e] });
});

// Booster-Embed
client.on("guildMemberUpdate", (o, n) => {
  if (o.premiumSince === n.premiumSince || !n.premiumSince) return;
  const ch = n.guild.channels.cache.get(process.env.BOOSTER_CHANNEL_ID);
  if (!ch) return;
  const e = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("💎 Neuer Boost!")
    .setDescription(`Danke ${n} fürs Boosten! 🚀`)
    .setImage(BANNER_URL);
  ch.send({ embeds: [e] });
});
/* ===========================
   Interaction Handler
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---------- VERIFY ---------- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
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
      try {
        const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
        if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
        await i.member.roles.add(role);
        return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
      } catch {
        return i.reply({ content: "❌ Konnte die Verify-Rolle nicht vergeben. Bot-Rechte & Rollen-Hierarchie prüfen.", ephemeral: true });
      }
    }

    /* ---------- PAYPAL (Cent-Beträge) ---------- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (amount === null || isNaN(amount) || amount <= 0) {
        return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });
      }
      // Zwei Nachkommastellen sicherstellen
      const amountFixed = Number(amount).toFixed(2); // "12.99"
      const link = `https://www.paypal.com/paypalme/${process.env.PAYPAL_ME || "jonahborospreitzer"}/${amountFixed}`;

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${amountFixed}€** zu zahlen.`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Community" });

      const btn = new ButtonBuilder()
        .setLabel(`Jetzt ${amountFixed}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(link);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ---------- STREAM ANNOUNCE ---------- */
    if (i.isChatInputCommand() && i.commandName === "streamannounce") {
      const twitchUser = (process.env.TWITCH_USERNAME || "cxlxrized_").toLowerCase();
      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${twitchUser}-1280x720.jpg`;
      const url = `https://twitch.tv/${twitchUser}`;

      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle("🔴 Live auf Twitch!")
        .setDescription(`@everyone **${twitchUser}** ist jetzt live! Schau vorbei 👇\n${url}`)
        .setImage(preview)
        .setFooter({ text: "Kandar Streaming" });

      return i.reply({ embeds: [embed] });
    }

    /* ---------- EMBED BUILDER (/embed) ---------- */
    if (i.isChatInputCommand() && i.commandName === "embed") {
      const modal = new ModalBuilder().setCustomId("custom_embed_modal").setTitle("Embed erstellen");

      const color = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Farbe (Hex, z. B. #ff0000) — optional")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const title = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Titel")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const footer = new TextInputBuilder()
        .setCustomId("footer")
        .setLabel("Footer — optional")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const thumb = new TextInputBuilder()
        .setCustomId("thumb")
        .setLabel("Thumbnail-URL — optional")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const image = new TextInputBuilder()
        .setCustomId("image")
        .setLabel("Bild-URL — optional")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(color),
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(footer),
        new ActionRowBuilder().addComponents(thumb),
        new ActionRowBuilder().addComponents(image),
      );

      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "custom_embed_modal") {
      const color = i.fields.getTextInputValue("color")?.trim();
      const title = i.fields.getTextInputValue("title")?.trim();
      const footer = i.fields.getTextInputValue("footer")?.trim();
      const thumb = i.fields.getTextInputValue("thumb")?.trim();
      const image = i.fields.getTextInputValue("image")?.trim();

      const embed = new EmbedBuilder().setTitle(title);
      if (footer) embed.setFooter({ text: footer });
      if (thumb) embed.setThumbnail(thumb);
      if (image) embed.setImage(image);
      if (color && /^#?[0-9a-f]{6}$/i.test(color)) embed.setColor(color.startsWith("#") ? color : `#${color}`);
      else embed.setColor(Colors.Blurple);

      return i.reply({ embeds: [embed] });
    }

    /* ---------- TICKET PANEL ---------- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Bewerbung als Designer\n` +
          `✂️ **Cutter Bewerbung** – Bewerbung als Cutter\n` +
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n` +
          `👥 **Support Anliegen** – Allgemeiner Support\n`
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

    // Ticket Auswahl -> ggf. Modal, Channel + Close-Buttons
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      const ensureButtons = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Schließen").setStyle(ButtonStyle.Danger)
        );

      // SHOP -> Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("ticket_shop_modal").setTitle("💰 Shop Ticket");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode (z.B. PayPal)").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("item").setLabel("Artikel / Produktname").setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        return i.showModal(modal);
      }

      // STREAMER -> Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("ticket_streamer_modal").setTitle("🎥 Streamer Bewerbung");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("avg").setLabel("Average Viewer").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("twitch").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        return i.showModal(modal);
      }

      const map = {
        kandar: { title: "✍️ Kandar Bewerbung", cat: "✍️ Kandar Bewerbungen", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter:  { title: "✂️ Cutter Bewerbung",  cat: "✂️ Cutter Bewerbungen",  desc: "Bitte nenne Software & Erfahrung." },
        highteam:{ title: "🛠️ Highteam Ticket",   cat: "🛠️ Highteam Anliegen",   desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket",     cat: "👥 Support",              desc: "Beschreibe bitte dein Anliegen." },
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

      const embed = new EmbedBuilder().setColor(Colors.Green).setTitle(data.title).setDescription(data.desc).setImage(BANNER_URL);
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ensureButtons()] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // SHOP Modal submit
    if (i.isModalSubmit() && i.customId === "ticket_shop_modal") {
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
        .setColor(Colors.Green)
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setImage(BANNER_URL);

      await ch.send({
        content: `${i.user}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Schließen").setStyle(ButtonStyle.Danger)
        )]
      });
      return i.reply({ content: `✅ Shop-Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // STREAMER Modal submit
    if (i.isModalSubmit() && i.customId === "ticket_streamer_modal") {
      const follower = i.fields.getTextInputValue("follower");
      const avg = i.fields.getTextInputValue("avg");
      const twitch = i.fields.getTextInputValue("twitch");

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
        .setImage(BANNER_URL);

      await ch.send({
        content: `${i.user}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Schließen").setStyle(ButtonStyle.Danger)
        )]
      });
      return i.reply({ content: `✅ Streamer-Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    // Ticket schließen -> Grund per Modal
    if (i.isButton() && i.customId === "ticket_close") {
      const modal = new ModalBuilder().setCustomId("ticket_close_reason_modal").setTitle("Ticket schließen");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("reason").setLabel("Grund des Schließens").setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticket_close_reason_modal") {
      const reason = i.fields.getTextInputValue("reason");
      const ch = i.channel;

      // Channel sperren (User keine Rechte)
      try {
        await ch.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false }).catch(()=>{});
      } catch {}

      // Log
      const logId = process.env.TICKET_LOG_CHANNEL_ID;
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`**Channel:** ${ch}\n**Von:** ${i.user}\n**Grund:** ${reason}`)
        .setTimestamp();

      if (logId) {
        const log = i.guild.channels.cache.get(logId);
        if (log) log.send({ embeds: [embed] }).catch(()=>{});
      }

      // Button entfernen
      try {
        const last = (await ch.messages.fetch({ limit: 10 })).first();
        if (last?.editable) {
          await last.edit({ components: [] }).catch(()=>{});
        }
      } catch {}

      return i.reply({ content: "✅ Ticket geschlossen.", ephemeral: true });
    }

    /* ---------- ORDER (ohne Ticket) ---------- */
if (i.isChatInputCommand() && i.commandName === "order") {
  const kunde = i.options.getUser("kunde");
  const artikel = i.options.getString("artikel");
  const preis = Number(i.options.getNumber("preis"));

  const sessionId = `${i.channel.id}:${i.user.id}:${Date.now()}`;
  const entry = {
    id: sessionId,
    kundeId: kunde.id,
    items: [{ name: artikel, price: preis }],
    closed: false,
  };
  orderSessions.set(sessionId, entry);

  const embed = buildOrderEmbed(entry);

  const row = buildOrderButtons(entry);

  return i.reply({ content: `${kunde}`, embeds: [embed], components: [row] });
}

/* ---------- Hilfsfunktionen für Order ---------- */
function calcSum(entry) {
  return entry.items.reduce((a, b) => a + Number(b.price || 0), 0);
}

function buildOrderEmbed(entry) {
  const sum = calcSum(entry);
  const list = entry.items
    .map(it => `• ${it.name} — **${Number(it.price).toFixed(2)} €**`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`🧾 Bestellung von ${client.users.cache.get(entry.kundeId)?.username || "Kunde"}`)
    .setDescription(`🛍️ **Kandar Shop**\n\n🧩 **Artikel**\n${list}\n\n💶 **Gesamt:** **${sum.toFixed(2)} €**`)
    .setImage(BANNER_URL)
    .setFooter({ text: "Kandar Shop" });
}

function buildOrderButtons(entry) {
  const sum = calcSum(entry).toFixed(2);
  const payUrl = `https://www.paypal.com/paypalme/${process.env.PAYPAL_ME || "jonahborospreitzer"}/${sum}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order_add:${entry.id}`).setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`order_remove:${entry.id}`).setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`order_finish:${entry.id}`).setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`order_cancel:${entry.id}`).setLabel("🗑️ Abbrechen").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setLabel(`💰 Jetzt ${sum} € zahlen`).setStyle(ButtonStyle.Link).setURL(payUrl)
  );
}

/* ---------- Order-Button-Handler ---------- */
if (i.isButton() && i.customId.startsWith("order_")) {
  const [action, sessionId] = i.customId.split(":");
  const entry = orderSessions.get(sessionId);
  if (!entry || entry.closed)
    return i.reply({ content: "❌ Diese Bestellung ist nicht mehr aktiv.", ephemeral: true });

  if (action === "order_add") {
    const modal = new ModalBuilder()
      .setCustomId(`order_add_modal:${sessionId}`)
      .setTitle("Artikel hinzufügen");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("price").setLabel("Preis (€)").setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return i.showModal(modal);
  }

  if (action === "order_remove") {
    const modal = new ModalBuilder()
      .setCustomId(`order_remove_modal:${sessionId}`)
      .setTitle("Artikel entfernen");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Exakter Artikelname zum Entfernen").setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return i.showModal(modal);
  }

  if (action === "order_finish") {
    entry.closed = true;
    const embed = buildOrderEmbed(entry)
      .setColor(Colors.Green)
      .setTitle(`✅ Bestellung abgeschlossen — ${client.users.cache.get(entry.kundeId)?.username || "Kunde"}`);
    return i.update({ embeds: [embed], components: [] });
  }

  if (action === "order_cancel") {
    entry.closed = true;
    orderSessions.delete(sessionId);
    return i.update({ content: "🗑️ Bestellung verworfen.", embeds: [], components: [] });
  }
}

/* ---------- Modal-Handler Add/Remove ---------- */
if (i.isModalSubmit() && i.customId.startsWith("order_add_modal:")) {
  const sessionId = i.customId.split(":")[1];
  const entry = orderSessions.get(sessionId);
  if (!entry || entry.closed)
    return i.reply({ content: "❌ Bestellung nicht mehr aktiv.", ephemeral: true });

  const name = i.fields.getTextInputValue("name");
  const price = parseFloat(i.fields.getTextInputValue("price").replace(",", "."));
  if (!name || isNaN(price) || price < 0)
    return i.reply({ content: "⚠️ Ungültiger Artikel oder Preis.", ephemeral: true });

  entry.items.push({ name, price });
  orderSessions.set(sessionId, entry);

  const embed = buildOrderEmbed(entry);
  const row = buildOrderButtons(entry);
  return i.reply({ embeds: [embed], components: [row] });
}

if (i.isModalSubmit() && i.customId.startsWith("order_remove_modal:")) {
  const sessionId = i.customId.split(":")[1];
  const entry = orderSessions.get(sessionId);
  if (!entry || entry.closed)
    return i.reply({ content: "❌ Bestellung nicht mehr aktiv.", ephemeral: true });

  const name = i.fields.getTextInputValue("name");
  const idx = entry.items.findIndex(it => it.name.toLowerCase() === name.toLowerCase());
  if (idx === -1)
    return i.reply({ content: "⚠️ Artikel nicht gefunden.", ephemeral: true });

  entry.items.splice(idx, 1);
  orderSessions.set(sessionId, entry);

  const embed = buildOrderEmbed(entry);
  const row = buildOrderButtons(entry);
  return i.reply({ embeds: [embed], components: [row] });
}

    /* ---------- FINISH & FEEDBACK ---------- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Rollen-Check (erlaubte Rollen in ENV, kommagetrennt IDs)
      const allowed = (process.env.FINISH_ALLOWED_ROLE_IDS || "")
        .split(",").map(s => s.trim()).filter(Boolean);
      if (allowed.length && !i.member.roles.cache.some(r => allowed.includes(r.id))) {
        return i.reply({ content: "❌ Du darfst diesen Befehl nicht nutzen.", ephemeral: true });
      }

      const kunde = i.options.getUser("kunde");
      // Customer-Rolle vergeben
      const customerRole = i.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
      if (customerRole) {
        const member = await i.guild.members.fetch(kunde.id).catch(()=>null);
        if (member) await member.roles.add(customerRole).catch(()=>{});
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Red) // gewünscht: rot
        .setTitle("✅ Bestellung abgeschlossen")
        .setDescription(`Vielen Dank ${kunde} für deinen Einkauf! 💚🛒\nBitte gib uns Feedback — das hilft uns sehr! ⭐`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Shop" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`feedback_open:${kunde.id}`).setLabel("📝 Feedback abgeben").setStyle(ButtonStyle.Primary)
      );

      return i.reply({ content: `${kunde}`, embeds: [embed], components: [row] });
    }

    // Feedback – Schritt 1: Verkäufer wählen (User-Select) + Weiter
    if (i.isButton() && i.customId.startsWith("feedback_open:")) {
      const kundeId = i.customId.split(":")[1];

      const sellerRow = new ActionRowBuilder().addComponents(
        // @ts-ignore (User Select in discord.js v14 über builders: MentionableSelect o. UserSelectMenuBuilder)
        new (class extends StringSelectMenuBuilder {})()
          .setCustomId(`feedback_seller_select:${kundeId}`)
          .setPlaceholder("Verkäufer auswählen")
          .setMinValues(1)
          .setMaxValues(1)
          .setType?.("USER") // fallback falls runtime ignoriert; in neueren Builds gibt es UserSelectMenuBuilder
      );

      // Fallback: Wenn UserSelectMenuBuilder nicht verfügbar ist, zeigen wir eine Warnung.
      // Viele Hostings haben die neuere Klasse, falls nicht, bitte auf v14.11+ updaten.
      let components;
      try {
        // Versuch: echte UserSelectMenuBuilder importieren (wenn environment es hat)
        const { UserSelectMenuBuilder } = await import("discord.js");
        const userSel = new UserSelectMenuBuilder()
          .setCustomId(`feedback_seller_select:${kundeId}`)
          .setPlaceholder("Verkäufer auswählen")
          .setMinValues(1)
          .setMaxValues(1);
        components = [new ActionRowBuilder().addComponents(userSel)];
      } catch {
        components = [sellerRow];
      }

      const nextBtn = new ButtonBuilder()
        .setCustomId(`feedback_next:${kundeId}`)
        .setLabel("Weiter")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

      const ctrl = new ActionRowBuilder().addComponents(nextBtn);

      return i.reply({ content: "Bitte wähle den Verkäufer aus:", components: [...components, ctrl], ephemeral: true });
    }

    // Verkäufer gewählt -> Weiter aktivieren
    if (i.isStringSelectMenu() && i.customId.startsWith("feedback_seller_select:")) {
      const kundeId = i.customId.split(":")[1];
      const sellerId = i.values[0];
      // Speichern in einer kleinen Map
      if (!client.feedbackTmp) client.feedbackTmp = new Map();
      client.feedbackTmp.set(`seller:${i.user.id}:${kundeId}`, sellerId);

      // Antwort aktualisieren: "Weiter" Button aktivieren
      const rows = i.message.components.map(r => ActionRowBuilder.from(r));
      const lastRow = rows[rows.length - 1];
      lastRow.components = lastRow.components.map(c => {
        const b = ButtonBuilder.from(c);
        if (b.data?.custom_id?.startsWith?.("feedback_next:")) {
          b.setDisabled(false);
        }
        return b;
      });

      return i.update({ components: rows });
    }

    // Weiter -> Modal öffnen (Sterne + Text)
    if (i.isButton() && i.customId.startsWith("feedback_next:")) {
      const kundeId = i.customId.split(":")[1];
      const sellerId = client.feedbackTmp?.get?.(`seller:${i.user.id}:${kundeId}`);
      if (!sellerId) return i.reply({ content: "Bitte zuerst Verkäufer auswählen.", ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`feedback_modal:${kundeId}:${sellerId}`).setTitle("Feedback abgeben");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("stars").setLabel("Sterne (1-5) ⭐").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("text").setLabel("Feedback-Text").setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
      return i.showModal(modal);
    }

    // Feedback Modal submit -> in Feedback-Channel posten
    if (i.isModalSubmit() && i.customId.startsWith("feedback_modal:")) {
      const [_, kundeId, sellerId] = i.customId.split(":");
      const starsRaw = i.fields.getTextInputValue("stars");
      const text = i.fields.getTextInputValue("text").slice(0, 1800);

      const starsNum = Math.max(1, Math.min(5, parseInt(starsRaw)));
      const stars = "⭐".repeat(starsNum) + "☆".repeat(5 - starsNum);

      const chId = process.env.FEEDBACK_CHANNEL_ID;
      const ch = i.guild.channels.cache.get(chId);
      if (!ch) return i.reply({ content: "❌ Feedback-Channel nicht gefunden.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(Colors.Red) // gewünscht: rot
        .setTitle("📝 Neues Feedback")
        .setDescription(`**👤 Kunde:** <@${kundeId}>\n**🛒 Verkäufer:** <@${sellerId}>\n\n**⭐ Bewertung:** ${stars}\n\n**💬 Feedback:**\n${text}`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Shop" })
        .setTimestamp();

      await ch.send({ embeds: [embed] });
      return i.reply({ content: "✅ Danke für dein Feedback!", ephemeral: true });
    }

    /* ---------- NUKE ---------- */
    if (i.isChatInputCommand() && i.commandName === "nuke") {
      await i.reply({ content: "⚠️ Channel wird geleert...", ephemeral: true });
      const ch = i.channel;
      try {
        let msgs;
        do {
          msgs = await ch.messages.fetch({ limit: 100 });
          await ch.bulkDelete(msgs, true);
        } while (msgs.size >= 2);
        await ch.send("✅ Channel erfolgreich genukt!");
      } catch {
        await ch.send("❌ Fehler beim Löschen (Nachrichten älter als 14 Tage können nicht entfernt werden).");
      }
    }

    /* ---------- CREATOR ADD ---------- */
    if (i.isChatInputCommand() && i.commandName === "creator" && i.options.getSubcommand() === "add") {
      const modal = new ModalBuilder().setCustomId("creator_add_modal").setTitle("Creator hinzufügen");
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

    if (i.isModalSubmit() && i.customId === "creator_add_modal") {
      const guild = i.guild;
      const title = i.fields.getTextInputValue("title");
      const creatorId = i.fields.getTextInputValue("creatorId");
      const twitch = i.fields.getTextInputValue("twitch");
      const youtube = i.fields.getTextInputValue("youtube") || "";
      const tiktok = i.fields.getTextInputValue("tiktok") || "";
      const instagram = i.fields.getTextInputValue("instagram") || "";
      const code = i.fields.getTextInputValue("code") || "";

      // Rolle vergeben (falls vorhanden)
      const member = await guild.members.fetch(creatorId).catch(()=>null);
      if (member) {
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === "creator");
        if (role) await member.roles.add(role).catch(()=>{});
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
      const file = "./data/creators.json";
      const arr = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(file, JSON.stringify(arr, null, 2));

      return i.followUp({ content: "✅ Creator erstellt!", ephemeral: true });
    }

    /* ---------- GIVEAWAY ---------- */
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
          `⏰ **Endet in:** ${dauerStr}\n` +
          `👥 **Teilnehmer:** 0\n\n` +
          `Klicke unten, um teilzunehmen!`
        )
        .setImage(BANNER_URL)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch" });

      const btn = new ButtonBuilder().setCustomId("giveaway_join").setLabel("Teilnehmen 🎉").setStyle(ButtonStyle.Primary);

      const msg = await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
        fetchReply: true,
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
      setTimeout(() => endGiveaway(msg.id).catch(()=>{}), dauer);
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

      // Teilnehmer-Zahl im Embed updaten
      try {
        const emb = EmbedBuilder.from(i.message.embeds[0]);
        const d = emb.data.description || "";
        const updated = d.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
        emb.setDescription(updated);
        await i.message.edit({ embeds: [emb] });
      } catch {}

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
   Giveaway-Ende (shared)
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

/* ===========================
   Logging
=========================== */
// Member
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});
client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});

// Message (gelöscht)
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle("🗑 Nachricht gelöscht").setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`)] });
});

// Channel
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});

// Role
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
});

// Voice
client.on("voiceStateUpdate", (o, n) => {
  const log = n.guild.channels.cache.get(process.env.VOICE_LOGS_CHANNEL_ID);
  if (!log) return;
  const user = n.member.user;
  let desc = "";
  if (!o.channel && n.channel) desc = `🎙️ ${user} ist **${n.channel.name}** beigetreten.`;
  else if (o.channel && !n.channel) desc = `🔇 ${user} hat **${o.channel.name}** verlassen.`;
  else if (o.channelId !== n.channelId) desc = `🔁 ${user} wechselte von **${o.channel.name}** zu **${n.channel.name}**.`;
  if (desc) log.send({ embeds: [new EmbedBuilder().setColor("#00A8FF").setTitle("🔊 Voice Log").setDescription(desc)] });
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);

