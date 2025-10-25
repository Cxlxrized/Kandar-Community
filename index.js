// index.js – Kandar Full Suite (Tickets+Close, Order, Finish+Feedback, Creator, Verify-Fix,
// Giveaways (persistent + Teilnehmerzahl), Twitch Announce, Paypal, Nuke, Server Stats, Logging)
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
  UserSelectMenuBuilder
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   Branding & Konstanten
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND_FOOTER = "Kandar";
const STREAM_FOOTER = "Kandar Streaming";
const SHOP_FOOTER = "Kandar Shop";

/* ===========================
   Client + Dateien
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
const ORDERS_FILE = "./data/orders.json";
for (const f of [GIVEAWAY_FILE, CREATORS_FILE, ORDERS_FILE])
  if (!fs.existsSync(f)) fs.writeFileSync(f, "[]");

const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const saveJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

/* ===========================
   Slash Commands
=========================== */
const commands = [
  new SlashCommandBuilder().setName("paypal").setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o => o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)),

  new SlashCommandBuilder().setName("panel").setDescription("Sendet das Ticket-Panel (Dropdown)"),

  new SlashCommandBuilder().setName("verifymsg").setDescription("Sendet die Verify-Nachricht"),

  new SlashCommandBuilder().setName("nuke").setDescription("Löscht viele Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("creator").setDescription("Creator-System verwalten")
    .addSubcommand(sub => sub.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")),

  // Giveaways
  new SlashCommandBuilder().setName("giveaway").setDescription("Starte ein neues Giveaway")
    .addStringOption(o => o.setName("preis").setDescription("Preis").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("z. B. 1d, 2h, 30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl der Gewinner").setRequired(true)),

  new SlashCommandBuilder().setName("reroll").setDescription("Ziehe neue Gewinner für ein Giveaway")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  new SlashCommandBuilder().setName("end").setDescription("Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  // Twitch announce
  new SlashCommandBuilder().setName("stream").setDescription("Poste ein Twitch Live-Announce-Embed"),

  // Finish (+ Feedback)
  new SlashCommandBuilder().setName("finish").setDescription("Kauf abschließen & Feedback anstoßen")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),

  // Order System (kein Ticket)
  new SlashCommandBuilder().setName("order").setDescription("Erstellt/verwaltet eine Bestellung (kein Ticket)")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis (€)").setRequired(true)),
].map(c => c.toJSON());

// Commands registrieren
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("✅ Slash Commands registriert!");
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
const loadGiveaways = () => loadJson(GIVEAWAY_FILE);
const saveGiveaways = (arr) => saveJson(GIVEAWAY_FILE, arr);

/* Feedback Drafts (modal -> seller select) */
const feedbackDrafts = new Map(); // key: userId, value: { stars, text, orderMsgId? }

/* ===========================
   READY
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // Server-Stats Kategorie + Channels
  let category = guild.channels.cache.find(c => c.name === "📊 Server Stats" && c.type === ChannelType.GuildCategory);
  if (!category)
    category = await guild.channels.create({ name: "📊 Server Stats", type: ChannelType.GuildCategory });

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
    if (channels.members) await channels.members.setName(`${stats.members}: ${humans}`).catch(() => {});
    if (channels.online) await channels.online.setName(`${stats.online}: ${online}`).catch(() => {});
    if (channels.bots) await channels.bots.setName(`${stats.bots}: ${bots}`).catch(() => {});
    if (channels.boosts) await channels.boosts.setName(`${stats.boosts}: ${boosts}`).catch(() => {});
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
    .setTimestamp()
    .setFooter({ text: BRAND_FOOTER });
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
    .setTimestamp()
    .setFooter({ text: BRAND_FOOTER });
  ch.send({ embeds: [embed] });
});

/* ===========================
   Interaction Handler
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON (FIX: immer Rolle geben) ---- */
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
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden! (VERIFY_ROLE_ID prüfen)", ephemeral: true });

      try {
        await i.member.roles.add(role);
        return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
      } catch (err) {
        console.error("Verify-Fehler:", err);
        return i.reply({
          content: "❌ Konnte die Verify-Rolle nicht vergeben. Bot-Rechte & Rollen-Hierarchie prüfen.",
          ephemeral: true
        });
      }
    }

    /* ---- PAYPAL ---- */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (!amount || amount <= 0) return i.reply({ content: "⚠️ Ungültiger Betrag!", ephemeral: true });

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
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n` +
          `👥 **Support Anliegen** – Support\n`
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

    // Dropdown -> ggf. Modals/Channel erstellen (mit Close-Button)
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // SHOP: Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
        const payment = new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode (z.B. PayPal, Überweisung)").setStyle(TextInputStyle.Short).setRequired(true);
        const item = new TextInputBuilder().setCustomId("item").setLabel("Artikel / Produktname").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(payment), new ActionRowBuilder().addComponents(item));
        return i.showModal(modal);
      }

      // STREAMER: Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        const follower = new TextInputBuilder().setCustomId("follower").setLabel("Follower (z.B. 1200)").setStyle(TextInputStyle.Short).setRequired(true);
        const avgViewer = new TextInputBuilder().setCustomId("avg_viewer").setLabel("Durchschnittliche Viewer").setStyle(TextInputStyle.Short).setRequired(true);
        const twitch = new TextInputBuilder().setCustomId("twitch_link").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(follower), new ActionRowBuilder().addComponents(avgViewer), new ActionRowBuilder().addComponents(twitch));
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

      const baseEmbed = new EmbedBuilder().setColor("#00FF00").setTitle(data.title).setDescription(data.desc).setImage(BANNER_URL).setFooter({ text: BRAND_FOOTER });
      const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);
      await ch.send({ content: `${i.user}`, embeds: [baseEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const closeBtn = new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Ticket schließen").setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- Ticket schließen: Button -> Modal für Grund ---- */
    if (i.isButton() && i.customId === "ticket_close") {
      const modal = new ModalBuilder().setCustomId("ticket_close_reason").setTitle("Ticket schließen – Grund");
      const reason = new TextInputBuilder().setCustomId("close_reason_text").setLabel("Grund (Pflichtfeld)").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticket_close_reason") {
      const reason = i.fields.getTextInputValue("close_reason_text");
      const ch = i.channel;

      const embed = new EmbedBuilder()
        .setColor("#ff4444")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`**Grund:** ${reason}\n\nDieses Ticket wird in **10 Sekunden** gelöscht.`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      await ch.send({ embeds: [embed] }).catch(() => {});
      setTimeout(() => ch.delete().catch(() => {}), 10_000);
      return;
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
      embed.setImage(BANNER_URL).setFooter({ text: BRAND_FOOTER });

      const msg = await i.reply({ embeds: [embed], fetchReply: true });
      const arr = loadJson(CREATORS_FILE);
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      saveJson(CREATORS_FILE, arr);
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

      const btn = new ButtonBuilder().setCustomId("giveaway_join").setLabel("Teilnehmen 🎉").setStyle(ButtonStyle.Primary);

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
      try {
        const embed = EmbedBuilder.from(i.message.embeds[0]);
        const newDesc = embed.data.description.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
        embed.setDescription(newDesc);
        await i.message.edit({ embeds: [embed] });
      } catch {}

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

    /* ---- STREAM ANNOUNCE ---- */
    if (i.isChatInputCommand() && i.commandName === "stream") {
      const username = (process.env.TWITCH_STREAMER || "").toLowerCase().trim();
      if (!username) return i.reply({ content: "❌ TWITCH_STREAMER nicht gesetzt.", ephemeral: true });

      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(username)}-1920x1080.jpg`;
      const url = `https://twitch.tv/${encodeURIComponent(username)}`;

      const embed = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle(`🔴 ${username} ist jetzt LIVE!`)
        .setURL(url)
        .setDescription(`Kommt vorbei und sagt Hallo! ✨\n▶️ **${url}**`)
        .setImage(preview)
        .setFooter({ text: STREAM_FOOTER })
        .setTimestamp();

      const ch = i.guild.channels.cache.get(process.env.STREAM_ANNOUNCE_CHANNEL_ID) || i.channel;
      await ch.send({ content: `@everyone`, embeds: [embed] });
      return i.reply({ content: "✅ Stream-Announce gesendet.", ephemeral: true });
    }

    /* ---- FINISH (+ Feedback Flow) ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Rollen-Check
      const allowed = (process.env.FINISH_ROLE_IDS || "")
        .split(",").map(s => s.trim()).filter(Boolean);
      if (allowed.length && !i.member.roles.cache.some(r => allowed.includes(r.id))) {
        return i.reply({ content: "❌ Du darfst diesen Befehl nicht verwenden.", ephemeral: true });
      }

      const kunde = i.options.getUser("kunde");
      // Customer-Rolle
      const custRole = i.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
      if (custRole) {
        const m = await i.guild.members.fetch(kunde.id).catch(() => null);
        if (m) await m.roles.add(custRole).catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("✅ Kauf abgeschlossen")
        .setDescription(`Vielen Dank ${kunde} für deinen Einkauf! 🛍️\n\nBitte gib uns Feedback – das hilft uns sehr! ⭐`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const feedbackBtn = new ButtonBuilder()
        .setCustomId("feedback_start")
        .setLabel("📝 Feedback abgeben")
        .setStyle(ButtonStyle.Primary);

      return i.reply({ content: `${kunde}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(feedbackBtn)] });
    }

    // Feedback Button -> Modal (Sterne + Text), danach Seller-Select
    if (i.isButton() && i.customId === "feedback_start") {
      const modal = new ModalBuilder().setCustomId("feedback_modal").setTitle("Feedback abgeben");
      const stars = new TextInputBuilder().setCustomId("fb_stars").setLabel("Sterne (1-5)").setStyle(TextInputStyle.Short).setRequired(true);
      const text = new TextInputBuilder().setCustomId("fb_text").setLabel("Dein Feedback (kurz)").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(stars), new ActionRowBuilder().addComponents(text));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "feedback_modal") {
      const stars = i.fields.getTextInputValue("fb_stars").trim();
      const text = i.fields.getTextInputValue("fb_text").trim();
      const s = Math.max(1, Math.min(5, parseInt(stars) || 0));
      feedbackDrafts.set(i.user.id, { stars: s, text });

      // Seller auswählen (User Select)
      const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId("feedback_seller_select")
          .setPlaceholder("Wähle den Verkäufer aus")
          .setMaxValues(1)
      );
      return i.reply({ content: "Bitte wähle jetzt den Verkäufer aus:", components: [row], ephemeral: true });
    }

    if (i.isUserSelectMenu() && i.customId === "feedback_seller_select") {
      const draft = feedbackDrafts.get(i.user.id);
      if (!draft) return i.reply({ content: "❌ Feedback-Daten nicht gefunden. Bitte erneut starten.", ephemeral: true });
      const sellerId = i.values[0];

      const starStr = "⭐".repeat(draft.stars) + "☆".repeat(5 - draft.stars);
      const embed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("📝 Neues Feedback")
        .setDescription(`**Bewertung:** ${starStr}\n\n**Feedback:** ${draft.text}\n\n**Verkäufer:** <@${sellerId}>`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      const fbCh = i.guild.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID);
      if (!fbCh) {
        await i.reply({ content: "❌ FEEDBACK_CHANNEL_ID nicht gesetzt/gefunden.", ephemeral: true });
      } else {
        await fbCh.send({ embeds: [embed] });
        await i.reply({ content: "✅ Feedback gesendet – danke dir!", ephemeral: true });
      }
      feedbackDrafts.delete(i.user.id);
    }

    /* ---- ORDER SYSTEM (kein Ticket, Embed mit Dropdown & Modal fürs Hinzufügen) ---- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const kunde = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preis = i.options.getNumber("preis");

      // Datenstruktur vorbereiten
      const orders = loadJson(ORDERS_FILE);
      const items = [{ name: artikel, price: preis }];

      const sum = items.reduce((a, b) => a + b.price, 0);
      const embed = new EmbedBuilder()
        .setColor("#00c851")
        .setTitle(`🧾 Bestellung von (${kunde.tag})`)
        .setDescription(`🛒 **Artikel:** ${artikel}\n💸 **Preis:** ${preis.toFixed(2)}€\n\n**Zwischensumme:** ${sum.toFixed(2)}€`)
        .setImage(BANNER_URL)
        .setFooter({ text: SHOP_FOOTER });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("order_actions")
        .setPlaceholder("Aktion auswählen")
        .addOptions(
          { label: "Artikel hinzufügen", value: "add_item", emoji: "➕" },
          { label: "Bestellung abschließen", value: "finish_order", emoji: "✅" },
        );

      const msg = await i.reply({ content: `${kunde}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], fetchReply: true });

      orders.push({
        messageId: msg.id,
        channelId: msg.channel.id,
        guildId: msg.guild.id,
        customerId: kunde.id,
        items
      });
      saveJson(ORDERS_FILE, orders);
    }

    // Order Actions
    if (i.isStringSelectMenu() && i.customId === "order_actions") {
      const orders = loadJson(ORDERS_FILE);
      const order = orders.find(o => o.messageId === i.message.id);
      if (!order) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });

      if (i.values[0] === "add_item") {
        const modal = new ModalBuilder().setCustomId(`order_add_${order.messageId}`).setTitle("Artikel hinzufügen");
        const name = new TextInputBuilder().setCustomId("o_name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true);
        const price = new TextInputBuilder().setCustomId("o_price").setLabel("Preis (€)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(price));
        return i.showModal(modal);
      }

      if (i.values[0] === "finish_order") {
        const total = order.items.reduce((a, b) => a + b.price, 0);
        const embed = EmbedBuilder.from(i.message.embeds[0])
          .setDescription(
            order.items.map((it, idx) => `**${idx + 1}.** ${it.name} — ${it.price.toFixed(2)}€`).join("\n") +
            `\n\n💰 **Gesamt:** ${total.toFixed(2)}€`
          );
        const rowDisabled = new ActionRowBuilder().addComponents(
          StringSelectMenuBuilder.from(i.component).setDisabled(true)
        );
        await i.message.edit({ embeds: [embed], components: [rowDisabled] });
        return i.reply({ content: "✅ Bestellung abgeschlossen.", ephemeral: true });
      }
    }

    // Order Modal Submit (add item)
    if (i.isModalSubmit() && i.customId.startsWith("order_add_")) {
      const msgId = i.customId.split("order_add_")[1];
      const orders = loadJson(ORDERS_FILE);
      const order = orders.find(o => o.messageId === msgId);
      if (!order) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });

      const name = i.fields.getTextInputValue("o_name");
      const priceStr = i.fields.getTextInputValue("o_price");
      const price = parseFloat(priceStr.replace(",", "."));
      if (isNaN(price) || price <= 0) return i.reply({ content: "⚠️ Ungültiger Preis.", ephemeral: true });

      order.items.push({ name, price });
      saveJson(ORDERS_FILE, orders);

      const total = order.items.reduce((a, b) => a + b.price, 0);
      const embed = EmbedBuilder.from((await i.channel.messages.fetch(msgId)).embeds[0])
        .setDescription(
          order.items.map((it, idx) => `**${idx + 1}.** ${it.name} — ${it.price.toFixed(2)}€`).join("\n") +
          `\n\n💰 **Gesamt:** ${total.toFixed(2)}€`
        );
      const msg = await i.channel.messages.fetch(msgId);
      await msg.edit({ embeds: [embed] });

      return i.reply({ content: "➕ Artikel hinzugefügt!", ephemeral: true });
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

    const winners = Array.from({ length: g.gewinner }, () =>
      `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`
    );

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
  const user = n.member?.user;
  if (!o.channel && n.channel) desc = `🎙️ ${user} ist **${n.channel.name}** beigetreten.`;
  else if (o.channel && !n.channel) desc = `🔇 ${user} hat **${o.channel.name}** verlassen.`;
  else if (o.channelId !== n.channelId) desc = `🔁 ${user} wechselte von **${o.channel.name}** zu **${n.channel.name}**.`;
  if (desc) log.send({ embeds: [new EmbedBuilder().setColor("#00A8FF").setTitle("🔊 Voice Log").setDescription(desc)] });
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);
