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
  AttachmentBuilder,
} from "discord.js";
import fs from "fs";
import "dotenv/config";

/* ===========================
   CLIENT SETUP
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
const TRANSCRIPT_DIR = "./data/transcripts";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");
if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR);

const BRAND_COLOR = "#9B5DE5";
const SUCCESS_COLOR = "#00FF88";
const ERROR_COLOR = "#FF006E";
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

/* ===========================
   SLASH COMMANDS
=========================== */
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("💰 Erstelle einen PayPal-Link für Zahlungen")
    .addNumberOption(o =>
      o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("📩 Sendet das Kandar Ticket-Panel"),

  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("✅ Sendet die Verify-Nachricht"),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("🎥 Creator-System verwalten")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("Fügt einen Creator hinzu (mit Links und Rollen)")
    ),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("💣 Löscht alle Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("🎉 Starte ein neues Giveaway")
    .addStringOption(o => o.setName("preis").setDescription("Preis").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("z. B. 1d 2h 30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl Gewinner").setRequired(true)),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("🔁 Ziehe neue Gewinner für ein Giveaway")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("🛑 Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("streamannounce")
    .setDescription("📡 Postet einen Twitch Stream-Announce (Kandar)"),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash Commands registriert (Kandar Branding aktiv)!");
  } catch (err) {
    console.error("❌ Fehler beim Registrieren:", err);
  }
})();

/* ===========================
   UTILS
=========================== */
function parseDuration(str) {
  if (!str) return 0;
  const m = str.toLowerCase().match(/^(\d+d)?(\d+h)?(\d+m)?$/);
  if (!m) return 0;
  let ms = 0;
  if (m[1]) ms += parseInt(m[1]) * 86400000;
  if (m[2]) ms += parseInt(m[2]) * 3600000;
  if (m[3]) ms += parseInt(m[3]) * 60000;
  return ms;
}
const loadGiveaways = () => JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
const saveGiveaways = (arr) => fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(arr, null, 2));

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Schließen").setStyle(ButtonStyle.Secondary).setEmoji("🔒"),
    new ButtonBuilder().setCustomId("ticket_transcript").setLabel("Transcript").setStyle(ButtonStyle.Primary).setEmoji("🧾"),
    new ButtonBuilder().setCustomId("ticket_delete").setLabel("Löschen").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
  );
}

async function makeTranscript(channel) {
  const msgs = await channel.messages.fetch({ limit: 100 });
  const sorted = Array.from(msgs.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let content = `Transcript für #${channel.name} (${channel.id})\nErstellt: ${new Date().toISOString()}\n\n`;
  for (const m of sorted) {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = `${m.author?.tag ?? "Unbekannt"} (${m.author?.id ?? "-"})`;
    const text = m.content?.replace(/\n/g, "\n  ") || "";
    content += `[${time}] ${author}:\n  ${text}\n`;
    if (m.attachments?.size) {
      for (const att of m.attachments.values()) content += `  [Anhang] ${att.url}\n`;
    }
  }
  const filePath = `${TRANSCRIPT_DIR}/transcript_${channel.id}_${Date.now()}.txt`;
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/* ===========================
   READY EVENT (STATS & GIVEAWAYS)
=========================== */
client.once("ready", async () => {
  console.log(`🤖 ${client.user.tag} ist online | Kandar Community aktiv`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

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

  const giveaways = loadGiveaways();
  for (const g of giveaways.filter(x => !x.beendet)) {
    const rest = g.endZeit - Date.now();
    if (rest <= 0) endGiveaway(g.messageId).catch(() => {});
    else setTimeout(() => endGiveaway(g.messageId).catch(() => {}), rest);
  }
});

/* ===========================
   WELCOME & BOOSTER EMBEDS
=========================== */
client.on("guildMemberAdd", async (member) => {
  const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("💜 Willkommen in der Kandar Community!")
    .setDescription(`Hey ${member}, schön, dass du jetzt Teil von **Kandar** bist! 🎉`)
    .setImage(BANNER_URL)
    .setFooter({ text: "Kandar Network" })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

client.on("guildMemberUpdate", async (o, n) => {
  if (o.premiumSince === n.premiumSince) return;
  if (!n.premiumSince) return;
  const ch = n.guild.channels.cache.get(process.env.BOOSTER_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("💎 Neuer Kandar Server-Boost!")
    .setDescription(`Vielen Dank ${n} fürs Boosten des Servers! 💜🚀`)
    .setImage(BANNER_URL)
    .setFooter({ text: "Kandar Boosting" })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});
/* ===========================
   INTERACTION HANDLER
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON ---- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf die **Kandar Community** zu erhalten!")
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Network" });

      const button = new ButtonBuilder()
        .setCustomId("verify_button")
        .setLabel("Verifizieren")
        .setStyle(ButtonStyle.Success);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }

    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      if (i.member.roles.cache.has(role.id))
        return i.reply({ content: "✅ Du bist bereits verifiziert!", ephemeral: true });

      await i.member.roles.add(role);
      return i.reply({ content: "🎉 Du bist jetzt verifiziert! Willkommen bei **Kandar** 💜", ephemeral: true });
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

    /* ---- TICKET PANEL (/panel) ---- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setTitle("🎟 Kandar Ticket-Center")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Portfolio & Aufträge\n` +
          `✂️ **Cutter Bewerbung** – Erfahrung & Software\n` +
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n` +
          `👥 **Support Anliegen** – Hilfe vom Team`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Support" });

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

    // Dropdown-Auswahl
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // SHOP -> Modal
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

      // STREAMER -> Modal
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

      // Sofort-Channel für restliche Kategorien
      const map = {
        kandar:  { title: "✍️ Kandar Bewerbung",   cat: "✍️ Kandar Bewerbungen",  desc: "Bitte schreibe deine Bewerbung hier." },
        designer:{ title: "🎨 Designer Bewerbung",  cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio (Bilder/Links)." },
        cutter:  { title: "✂️ Cutter Bewerbung",    cat: "✂️ Cutter Bewerbungen",   desc: "Bitte nenne Software & Erfahrung." },
        highteam:{ title: "🛠️ Highteam Ticket",     cat: "🛠️ Highteam Anliegen",    desc: "Beschreibe bitte dein internes Anliegen." },
        support: { title: "👥 Support Ticket",      cat: "👥 Support Anliegen",      desc: "Beschreibe bitte dein Anliegen." },
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
        topic: `ticket:${i.user.id}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setTitle(data.title)
        .setDescription(`${data.desc}\n\n**Team meldet sich zeitnah.**`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Support" });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControls()] });
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
        topic: `ticket:${i.user.id}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}\n\nBitte beschreibe dein Anliegen genauer.`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Support" });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControls()] });
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
        topic: `ticket:${i.user.id}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}\n\nBitte warte auf Rückmeldung vom Team.`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar Creator" });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControls()] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- TICKET BUTTONS (close / transcript / delete) ---- */
    if (i.isButton() && ["ticket_close","ticket_transcript","ticket_delete"].includes(i.customId)) {
      const openerId = i.channel.topic?.startsWith("ticket:") ? i.channel.topic.split(":")[1] : null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;
      const isStaff = staffRoleId ? i.member.roles.cache.has(staffRoleId) : i.member.permissions.has(PermissionFlagsBits.ManageChannels);
      const isOpener = openerId && i.user.id === openerId;

      if (!isStaff && !isOpener) {
        return i.reply({ content: "🚫 Du darfst dieses Ticket nicht verwalten.", ephemeral: true });
      }

      // CLOSE = Schreibrechte entziehen (nur Team)
      if (i.customId === "ticket_close") {
        await i.channel.permissionOverwrites.edit(openerId ?? i.user.id, { SendMessages: false });
        return i.reply({ content: "🔒 Ticket geschlossen. Nur Team kann schreiben.", ephemeral: true });
      }

      // TRANSCRIPT = Datei erzeugen & posten
      if (i.customId === "ticket_transcript") {
        const path = await makeTranscript(i.channel);
        const file = new AttachmentBuilder(path);
        await i.reply({ content: "🧾 Transcript erstellt:", files: [file], ephemeral: false });
        return;
      }

      // DELETE = Channel löschen
      if (i.customId === "ticket_delete") {
        await i.reply({ content: "🗑️ Ticket wird in 3 Sekunden gelöscht...", ephemeral: true });
        setTimeout(() => i.channel.delete().catch(() => {}), 3000);
        return;
      }
    }

    /* ---- CREATOR ADD ---- */
    if (i.isChatInputCommand() && i.commandName === "creator" && i.options.getSubcommand() === "add") {
      const modal = new ModalBuilder().setCustomId("creatorAddModal").setTitle("Creator hinzufügen");
      const fields = [
        { id: "title",     label: "Titel des Embeds",          style: TextInputStyle.Short, req: true  },
        { id: "creatorId", label: "Discord-ID des Creators",   style: TextInputStyle.Short, req: true  },
        { id: "twitch",    label: "Twitch Link",               style: TextInputStyle.Short, req: true  },
        { id: "youtube",   label: "YouTube Link (Optional)",   style: TextInputStyle.Short, req: false },
        { id: "tiktok",    label: "TikTok Link (Optional)",    style: TextInputStyle.Short, req: false },
        { id: "instagram", label: "Instagram Link (Optional)", style: TextInputStyle.Short, req: false },
        { id: "code",      label: "Creator Code (Optional)",   style: TextInputStyle.Short, req: false },
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
        .setColor(BRAND_COLOR)
        .setTitle(title)
        .addFields({ name: "Twitch", value: twitch });
      if (youtube)   embed.addFields({ name: "YouTube",   value: youtube });
      if (tiktok)    embed.addFields({ name: "TikTok",    value: tiktok });
      if (instagram) embed.addFields({ name: "Instagram", value: instagram });
      if (code)      embed.addFields({ name: "Creator Code", value: code });

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

    /* ---- GIVEAWAY START ---- */
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
        .setColor(BRAND_COLOR)
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(
          `**Preis:** ${preis}\n` +
          `🎁 **Gewinner:** ${gewinner}\n` +
          `⏰ **Endet in:** ${dauerStr}\n` +
          `👥 **Teilnehmer:** **0**\n\n` +
          `Klicke unten, um teilzunehmen!`
        )
        .setImage(BANNER_URL)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch • Kandar Community" });

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

    /* ---- GIVEAWAY TEILNAHME + ZÄHLER UPDATEN ---- */
    if (i.isButton() && i.customId === "giveaway_join") {
      const giveaways = loadGiveaways();
      const g = giveaways.find(x => x.messageId === i.message.id);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.beendet) return i.reply({ content: "🚫 Dieses Giveaway ist beendet!", ephemeral: true });
      if (g.teilnehmer.includes(i.user.id))
        return i.reply({ content: "⚠️ Du bist bereits dabei!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      saveGiveaways(giveaways);

      // Embed aktualisieren (Teilnehmerzahl)
      const old = i.message.embeds?.[0];
      if (old) {
        const updated = EmbedBuilder.from(old);
        const newDesc = (old.description || "")
          .replace(/👥 \*\*Teilnehmer:\*\* \*\d+\*\*/, `👥 **Teilnehmer:** **${g.teilnehmer.length}**`);
        updated.setDescription(newDesc);
        await i.message.edit({ embeds: [updated] });
      }

      return i.reply({ content: "✅ Teilnahme gespeichert!", ephemeral: true });
    }

    /* ---- GIVEAWAY REROLL / END ---- */
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
      const twitchUser = (process.env.TWITCH_USER || "").toLowerCase().trim();
      const channelId = process.env.TWITCH_CHANNEL_ID;
      if (!twitchUser || !channelId) {
        return i.reply({ content: "❌ TWITCH_USER oder TWITCH_CHANNEL_ID fehlt in der .env", ephemeral: true });
      }
      const ch = i.guild.channels.cache.get(channelId);
      if (!ch) return i.reply({ content: "❌ Announce-Channel nicht gefunden.", ephemeral: true });

      // Ungecachte Preview (einfacher ohne API)
      const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${twitchUser}-1280x720.jpg?rand=${Date.now()}`;
      const url = `https://twitch.tv/${twitchUser}`;

      const embed = new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`🔴 ${twitchUser} ist jetzt LIVE!`)
        .setDescription(`Schau rein und unterstütze **Kandar** auf Twitch:\n${url}`)
        .setImage(preview)
        .setFooter({ text: "Kandar Streaming" })
        .setTimestamp();

      await ch.send({ content: "@here", embeds: [embed] });
      return i.reply({ content: "✅ Stream-Announce gesendet!", ephemeral: true });
    }

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

/* ===========================
   GIVEAWAY BEENDEN (shared)
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
      const base = msg.embeds[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setTitle("🎉 Giveaway");
      const embed = base
        .setColor("#808080")
        .setDescription(`**Preis:** ${g.preis}\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const base = msg.embeds[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setTitle("🎉 Giveaway");
    const replacedDesc = (base.data.description || "")
      .replace(/⏰ \*\*Endet in:\*\*.*\n?/, "")
      .replace(/👥 \*\*Teilnehmer:\*\* \*\d+\*\*/, `👥 **Teilnehmer:** **${g.teilnehmer.length}**`);
    const embed = base
      .setColor(BRAND_COLOR)
      .setDescription(`${replacedDesc}\n🏆 **Gewinner:** ${winners.join(", ")}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* ===========================
   LOGGING
=========================== */
// Member
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});
client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});

// Message (gelöscht)
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setTitle("🗑 Nachricht gelöscht").setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`)] });
});

// Channel
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});

// Role
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
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
   LOGIN
=========================== */
client.login(process.env.DISCORD_TOKEN);
