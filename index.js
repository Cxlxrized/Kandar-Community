// ============================
//   KANDAR BOT — TEIL 1/2
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
} from "discord.js";
import fs from "fs";
import "dotenv/config";

// === CLIENT SETUP ===
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

// === DATA FILES ===
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const FILES = {
  giveaways: "./data/giveaways.json",
  creators: "./data/creators.json",
};
for (const f of Object.values(FILES))
  if (!fs.existsSync(f)) fs.writeFileSync(f, "[]");

const BANNER =
  "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

// === SLASH COMMANDS ===
const commands = [
  // Paypal
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption((o) =>
      o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)
    ),

  // Ticket Panel
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Sendet das Ticket Panel"),

  // Verify Message
  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  // Nuke
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht alle Nachrichten im Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // Creator System
  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System verwalten")
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Erstellt ein Creator-Panel")
    ),

  // Giveaway
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Starte ein Giveaway")
    .addStringOption((o) =>
      o.setName("preis").setDescription("Preis").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("dauer")
        .setDescription("z. B. 1d, 2h, 30m")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("gewinner")
        .setDescription("Anzahl der Gewinner")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Ziehe neue Gewinner")
    .addStringOption((o) =>
      o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beende ein Giveaway")
    .addStringOption((o) =>
      o.setName("msgid").setDescription("Nachrichten-ID").setRequired(true)
    ),

  // Twitch Stream
  new SlashCommandBuilder()
    .setName("stream")
    .setDescription("Postet ein Twitch-Announce Embed"),

  // Finish System
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen und Feedback starten")
    .addUserOption((o) =>
      o.setName("kunde").setDescription("Kunde").setRequired(true)
    ),

  // Order System
  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt ein Order-Ticket")
    .addUserOption((o) =>
      o.setName("kunde").setDescription("Kunde").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("produkt").setDescription("Produkt").setRequired(true)
    )
    .addNumberOption((o) =>
      o.setName("preis").setDescription("Preis (€)").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("zahlungsmethode")
        .setDescription("z. B. PayPal, Bar, Crypto")
        .setRequired(true)
    ),
].map((c) => c.toJSON());

// === REGISTER COMMANDS ===
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash Commands geladen!");
  } catch (err) {
    console.error("❌ Fehler:", err);
  }
})();

// === UTILS ===
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const parseDuration = (str) => {
  const m = str.match(/(\d+d)?(\d+h)?(\d+m)?/);
  let ms = 0;
  if (m[1]) ms += parseInt(m[1]) * 86400000;
  if (m[2]) ms += parseInt(m[2]) * 3600000;
  if (m[3]) ms += parseInt(m[3]) * 60000;
  return ms;
};

const twitchPreview = (user) =>
  `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user}-1280x720.jpg`;

// === READY EVENT ===
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // Server-Stats
  const catName = "📊 Server Stats";
  let cat = guild.channels.cache.find(
    (c) => c.name === catName && c.type === ChannelType.GuildCategory
  );
  if (!cat)
    cat = await guild.channels.create({
      name: catName,
      type: ChannelType.GuildCategory,
    });

  const stats = {
    members: "🧍‍♂️ Mitglieder",
    online: "💻 Online",
    bots: "🤖 Bots",
    boosts: "💎 Boosts",
  };

  for (const n of Object.values(stats)) {
    if (!guild.channels.cache.find((c) => c.name.startsWith(n))) {
      await guild.channels.create({
        name: `${n}: 0`,
        type: ChannelType.GuildVoice,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
    }
  }

  const updateStats = async () => {
    const members = await guild.members.fetch();
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;
    const online = members.filter(
      (m) => m.presence && m.presence.status !== "offline"
    ).size;
    const boosts = guild.premiumSubscriptionCount || 0;

    const channels = {
      members: guild.channels.cache.find((c) => c.name.startsWith(stats.members)),
      online: guild.channels.cache.find((c) => c.name.startsWith(stats.online)),
      bots: guild.channels.cache.find((c) => c.name.startsWith(stats.bots)),
      boosts: guild.channels.cache.find((c) => c.name.startsWith(stats.boosts)),
    };
    if (channels.members)
      await channels.members.setName(`${stats.members}: ${humans}`);
    if (channels.online)
      await channels.online.setName(`${stats.online}: ${online}`);
    if (channels.bots) await channels.bots.setName(`${stats.bots}: ${bots}`);
    if (channels.boosts)
      await channels.boosts.setName(`${stats.boosts}: ${boosts}`);
  };
  updateStats();
  setInterval(updateStats, 5 * 60 * 1000);

  console.log("📊 Stats laufen!");
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
    .setImage(BANNER)
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
    .setImage(BANNER)
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

/* ===========================
   Giveaway Helpers
=========================== */
const scheduleOutstandingGiveaways = async () => {
  try {
    const data = load(FILES.giveaways).filter((g) => !g.beendet);
    for (const g of data) {
      const rest = g.endZeit - Date.now();
      if (rest <= 0) endGiveaway(g.messageId).catch(() => {});
      else setTimeout(() => endGiveaway(g.messageId).catch(() => {}), rest);
    }
  } catch {}
};
client.on("ready", scheduleOutstandingGiveaways);

async function endGiveaway(msgid, interaction = null) {
  const giveaways = load(FILES.giveaways);
  const g = giveaways.find((x) => x.messageId === msgid);
  if (!g || g.beendet) return;
  g.beendet = true;
  save(FILES.giveaways, giveaways);

  try {
    const guild = await client.guilds.fetch(g.guildId);
    const ch = await guild.channels.fetch(g.channelId);
    const msg = await ch.messages.fetch(g.messageId);

    if (!g.teilnehmer.length) {
      const final = EmbedBuilder.from(msg.embeds[0])
        .setColor("#808080")
        .setDescription(`**Preis:** ${g.preis}\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [final], components: [] });
      if (interaction)
        await interaction.reply({ content: "❌ Keine Teilnehmer. Giveaway beendet.", ephemeral: true });
      return;
    }

    // Gewinner ziehen (ohne Duplikate)
    const pool = [...g.teilnehmer];
    const winners = [];
    for (let n = 0; n < Math.min(g.gewinner, pool.length); n++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(`<@${pool.splice(idx, 1)[0]}>`);
    }

    const final = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .spliceFields(0, 1, { name: "👥 Teilnehmer", value: `${g.teilnehmer.length}`, inline: true })
      .addFields({ name: "🏆 Gewinner", value: winners.join(", ") })
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [final], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

async function updateGiveawayCount(i) {
  try {
    const giveaways = load(FILES.giveaways);
    const g = giveaways.find((x) => x.messageId === i.message.id);
    if (!g) return;
    const msg = i.message;
    const embed = EmbedBuilder.from(msg.embeds[0]);
    // erstes Feld als Teilnehmerzähler (oder hinzufügen)
    const fields = embed.data.fields ?? [];
    const hasCount = fields.findIndex((f) => f.name === "👥 Teilnehmer");
    if (hasCount >= 0) {
      fields[hasCount].value = `${g.teilnehmer.length}`;
    } else {
      fields.unshift({ name: "👥 Teilnehmer", value: `${g.teilnehmer.length}`, inline: true });
    }
    embed.setFields(fields);
    await msg.edit({ embeds: [embed] });
  } catch {}
}

/* ===========================
   Interaction Handler
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON ---- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER);

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
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
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

    /* ---- TWITCH STREAM ANNOUNCE ---- */
    if (i.isChatInputCommand() && i.commandName === "stream") {
      const tUser = (process.env.TWITCH_USERNAME || "").toLowerCase();
      if (!tUser) return i.reply({ content: "⚠️ TWITCH_USERNAME ist nicht gesetzt.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🔴 Live auf Twitch!")
        .setDescription(`Wir sind jetzt live auf Twitch: https://twitch.tv/${tUser}\nKommt vorbei! 🎮✨`)
        .setImage(twitchPreview(tUser))
        .setFooter({ text: "Kandar Streaming" })
        .setTimestamp();

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
            `🛠️ **Highteam Anliegen** – Interne Anliegen\n` +
            `👥 **Support Anliegen** – Hilfe vom Team`
        )
        .setImage(BANNER);

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

    const ticketControlsRow = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_close").setEmoji("🔒").setLabel("Schließen").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_transcript").setEmoji("📝").setLabel("Transcript").setStyle(ButtonStyle.Secondary)
      );

    async function createTicketChannel(i, catName, chName, title, description) {
      const guild = i.guild;
      let cat = guild.channels.cache.find((c) => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: chName,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder().setColor("#00FF00").setTitle(title).setDescription(description).setImage(BANNER);
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControlsRow()] });
      return ch;
    }

    // Dropdown Auswahl Tickets
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // SHOP Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
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
        modal.addComponents(new ActionRowBuilder().addComponents(payment), new ActionRowBuilder().addComponents(item));
        return i.showModal(modal);
      }

      // STREAMER Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        const follower = new TextInputBuilder().setCustomId("follower").setLabel("Follower (z.B. 1200)").setStyle(TextInputStyle.Short).setRequired(true);
        const avgViewer = new TextInputBuilder().setCustomId("avg_viewer").setLabel("Durchschnittliche Viewer").setStyle(TextInputStyle.Short).setRequired(true);
        const twitch = new TextInputBuilder().setCustomId("twitch_link").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(follower),
          new ActionRowBuilder().addComponents(avgViewer),
          new ActionRowBuilder().addComponents(twitch)
        );
        return i.showModal(modal);
      }

      // Sofort-Channel
      const map = {
        kandar: { title: "✍️ Kandar Bewerbung", cat: "✍️ Kandar Bewerbungen", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter: { title: "✂️ Cutter Bewerbung", cat: "✂️ Cutter Bewerbungen", desc: "Bitte nenne Software & Erfahrung." },
        highteam: { title: "🛠️ Highteam Ticket", cat: "🛠️ Highteam Anliegen", desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket", cat: "👥 Support Tickets", desc: "Beschreibe bitte dein Anliegen." },
      };
      const d = map[choice];
      if (!d) return;

      const chName = `${d.title.split(" ")[0]}-${i.user.username}`;
      const ch = await createTicketChannel(i, d.cat, chName, d.title, d.desc);
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // SHOP Ticket Submit
    if (i.isModalSubmit() && i.customId === "shopTicketModal") {
      const payment = i.fields.getTextInputValue("payment");
      const item = i.fields.getTextInputValue("item");
      const ch = await createTicketChannel(
        i,
        "💰 Shop Tickets",
        `💰-${i.user.username}`,
        "💰 Shop Ticket",
        `🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`
      );
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }

    // STREAMER Ticket Submit
    if (i.isModalSubmit() && i.customId === "streamerTicketModal") {
      const follower = i.fields.getTextInputValue("follower");
      const avgViewer = i.fields.getTextInputValue("avg_viewer");
      const twitch = i.fields.getTextInputValue("twitch_link");
      const ch = await createTicketChannel(
        i,
        "🎥 Streamer Bewerbungen",
        `🎥-${i.user.username}`,
        "🎥 Streamer Bewerbung",
        `👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`
      );
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    // Ticket Controls
    if (i.isButton() && i.customId === "ticket_close") {
      if (!i.channel) return;
      await i.deferReply({ ephemeral: true });
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false, ViewChannel: true }).catch(() => {});
      await i.followUp({ content: "🔒 Ticket geschlossen (schreibgeschützt).", ephemeral: true });
    }

    if (i.isButton() && i.customId === "ticket_transcript") {
      if (!i.channel) return;
      await i.deferReply({ ephemeral: true });
      try {
        const messages = await i.channel.messages.fetch({ limit: 100 });
        const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const lines = sorted.map(
          (m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag || "?"}: ${m.content || "[Embed/Datei]"}`
        );
        const buf = Buffer.from(lines.join("\n"), "utf8");
        await i.followUp({ content: "📝 Transcript erstellt:", files: [{ attachment: buf, name: "transcript.txt" }], ephemeral: true });
      } catch {
        await i.followUp({ content: "❌ Transcript fehlgeschlagen.", ephemeral: true });
      }
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
      modal.addComponents(
        ...fields.map((f) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.req)
          )
        )
      );
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
        const role = guild.roles.cache.find((r) => r.name.toLowerCase() === "creator");
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
      const arr = load(FILES.creators);
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      save(FILES.creators, arr);
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
      if (!gewinner || gewinner < 1) return i.reply({ content: "⚠️ Bitte gib eine gültige Gewinneranzahl an!", ephemeral: true });

      const dauer = parseDuration(dauerStr);
      if (!dauer || dauer <= 0) return i.reply({ content: "⚠️ Ungültige Dauer (z. B. 1d2h30m)", ephemeral: true });

      const endZeit = Date.now() + dauer;

      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n⏰ **Endet in:** ${dauerStr}\n\nKlicke unten, um teilzunehmen!`)
        .addFields({ name: "👥 Teilnehmer", value: "0", inline: true })
        .setImage(BANNER)
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet automatisch" });

      const btn = new ButtonBuilder().setCustomId("giveaway_join").setLabel("Teilnehmen 🎉").setStyle(ButtonStyle.Primary);

      const msg = await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
        fetchReply: true,
      });

      const giveaways = load(FILES.giveaways);
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
      save(FILES.giveaways, giveaways);
      setTimeout(() => endGiveaway(msg.id).catch(() => {}), dauer);
    }

    if (i.isButton() && i.customId === "giveaway_join") {
      const giveaways = load(FILES.giveaways);
      const g = giveaways.find((x) => x.messageId === i.message.id);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.beendet) return i.reply({ content: "🚫 Dieses Giveaway ist beendet!", ephemeral: true });
      if (g.teilnehmer.includes(i.user.id)) return i.reply({ content: "⚠️ Du bist bereits dabei!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      save(FILES.giveaways, giveaways);
      await updateGiveawayCount(i);
      return i.reply({ content: "✅ Teilnahme gespeichert!", ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "reroll") {
      const msgid = i.options.getString("msgid");
      const g = load(FILES.giveaways).find((x) => x.messageId === msgid);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (!g.teilnehmer.length) return i.reply({ content: "😢 Keine Teilnehmer!", ephemeral: true });

      const pool = [...g.teilnehmer];
      const winners = [];
      for (let n = 0; n < Math.min(g.gewinner, pool.length); n++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(`<@${pool.splice(idx, 1)[0]}>`);
      }
      return i.reply(`🔁 Neue Gewinner für **${g.preis}**: ${winners.join(", ")}`);
    }

    if (i.isChatInputCommand() && i.commandName === "end") {
      await endGiveaway(i.options.getString("msgid"), i);
    }

    /* ---- FINISH + FEEDBACK ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Rollen-Check
      const allowed = String(process.env.FINISH_ALLOWED_ROLE_IDS || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (allowed.length && !allowed.some((rid) => i.member.roles.cache.has(rid)))
        return i.reply({ content: "🚫 Du darfst diesen Befehl hier nicht verwenden.", ephemeral: true });

      const kunde = i.options.getUser("kunde");
      const customerRoleId = process.env.CUSTOMER_ROLE_ID;
      if (customerRoleId) {
        const m = await i.guild.members.fetch(kunde.id).catch(() => null);
        if (m) await m.roles.add(customerRoleId).catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("✅ Bestellung abgeschlossen")
        .setDescription(`Danke ${kunde} für deinen Kauf! 💸🛒\nKlicke unten auf **Feedback geben**, um uns ⭐ zu vergeben!`)
        .setImage(BANNER)
        .setFooter({ text: "Kandar • Vielen Dank für deinen Support!" })
        .setTimestamp();

      const feedbackBtn = new ButtonBuilder().setCustomId(`feedback_start:${kunde.id}`).setLabel("Feedback geben").setEmoji("📝").setStyle(ButtonStyle.Primary);

      return i.reply({ content: `${kunde}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(feedbackBtn)] });
    }

    // Schritt 1: Verkäufer-Auswahl (Select) nach Button
    if (i.isButton() && i.customId.startsWith("feedback_start:")) {
      const buyerId = i.customId.split(":")[1];

      const sellerRoleIds = String(process.env.SELLER_ROLE_IDS || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      const members = await i.guild.members.fetch();
      const sellers = members.filter((m) => sellerRoleIds.some((rid) => m.roles.cache.has(rid)));

      if (!sellers.size) return i.reply({ content: "⚠️ Keine Verkäufer gefunden.", ephemeral: true });

      const options = sellers.first(25).map((m) => ({
        label: m.displayName,
        value: m.id,
        emoji: "🛍️",
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId(`feedback_seller:${buyerId}`)
        .setPlaceholder("Wähle den Verkäufer aus")
        .addOptions(options);

      return i.reply({
        content: "Wähle bitte den Verkäufer aus:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    // Schritt 2: Nach Verkäuferwahl -> Modal (Sterne + Text)
    if (i.isStringSelectMenu() && i.customId.startsWith("feedback_seller:")) {
      const buyerId = i.customId.split(":")[1];
      const sellerId = i.values[0];

      const modal = new ModalBuilder().setCustomId(`feedback_modal:${buyerId}:${sellerId}`).setTitle("Feedback abgeben");
      const stars = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("Sterne (1-5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const text = new TextInputBuilder().setCustomId("text").setLabel("Dein Feedback (kurz)").setStyle(TextInputStyle.Paragraph).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(stars), new ActionRowBuilder().addComponents(text));
      return i.showModal(modal);
    }

    // Schritt 3: Modal Submit -> Feedback in Channel
    if (i.isModalSubmit() && i.customId.startsWith("feedback_modal:")) {
      const [, buyerId, sellerId] = i.customId.split(":");
      const starsVal = Math.max(1, Math.min(5, parseInt(i.fields.getTextInputValue("stars")) || 0));
      const text = i.fields.getTextInputValue("text");

      const starStr = "⭐".repeat(starsVal) + "☆".repeat(5 - starsVal);
      const buyer = await i.guild.members.fetch(buyerId).catch(() => null);
      const seller = await i.guild.members.fetch(sellerId).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("📝 Neues Feedback eingegangen")
        .setDescription(`**Käufer:** ${buyer ? buyer : `<@${buyerId}>`} 🧑‍💻\n**Verkäufer:** ${seller ? seller : `<@${sellerId}>`} 🛍️\n**Bewertung:** ${starStr}\n\n**💬 Feedback:**\n${text}`)
        .setImage(BANNER)
        .setFooter({ text: "Kandar • Danke fürs Feedback! ❤️" })
        .setTimestamp();

      const chId = process.env.FEEDBACK_CHANNEL_ID;
      const ch = chId ? i.guild.channels.cache.get(chId) : null;
      if (!ch) {
        await i.reply({ content: "⚠️ FEEDBACK_CHANNEL_ID nicht gesetzt oder Channel nicht gefunden.", ephemeral: true });
      } else {
        await ch.send({ embeds: [embed] });
        await i.reply({ content: "✅ Danke! Dein Feedback wurde gespeichert.", ephemeral: true });
      }
    }

    /* ---- ORDER SYSTEM ---- */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const kunde = i.options.getUser("kunde");
      const produkt = i.options.getString("produkt");
      const preis = i.options.getNumber("preis");
      const zahlung = i.options.getString("zahlungsmethode");

      const catName = "🧾 Aufträge";
      let cat = i.guild.channels.cache.find((c) => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await i.guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await i.guild.channels.create({
        name: `🧾-${kunde.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: i.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: kunde.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🧾 Neuer Auftrag")
        .setDescription(`**Kunde:** ${kunde}\n**Produkt:** ${produkt}\n**Preis:** ${preis.toFixed(2)}€\n**Zahlung:** ${zahlung}`)
        .setImage(BANNER)
        .setTimestamp();

      const paidBtn = new ButtonBuilder().setCustomId("order_paid").setEmoji("✅").setLabel("Bezahlt").setStyle(ButtonStyle.Success);
      const closeBtn = new ButtonBuilder().setCustomId("order_close").setEmoji("🔒").setLabel("Ticket schließen").setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${kunde}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(paidBtn, closeBtn)] });
      await i.reply({ content: `✅ Auftrag erstellt: ${ch}`, ephemeral: true });
    }

    if (i.isButton() && (i.customId === "order_paid" || i.customId === "order_close")) {
      const msg = i.message;
      const embed = EmbedBuilder.from(msg.embeds[0]);
      const logCh = i.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID || "");

      if (i.customId === "order_paid") {
        embed.setColor("#00C853").setTitle("🧾 Auftrag • Bezahlt");
        await msg.edit({ embeds: [embed] });
        if (logCh) logCh.send({ embeds: [embed.setFooter({ text: "Order Log • bezahlt" })] });
        return i.reply({ content: "✅ Als bezahlt markiert.", ephemeral: true });
      }

      if (i.customId === "order_close") {
        await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false, ViewChannel: true }).catch(() => {});
        embed.setColor("#B71C1C").setTitle("🧾 Auftrag • Geschlossen");
        await msg.edit({ embeds: [embed], components: [] });
        if (logCh) logCh.send({ embeds: [embed.setFooter({ text: "Order Log • geschlossen" })] });
        return i.reply({ content: "🔒 Auftrag geschlossen.", ephemeral: true });
      }
    }
  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

/* ===========================
   Logging System
=========================== */
// Member
client.on("guildMemberAdd", (m) => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});
client.on("guildMemberRemove", (m) => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});

// Message (gelöscht)
client.on("messageDelete", (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log)
    log.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🗑 Nachricht gelöscht")
          .setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`),
      ],
    });
});

// Channel
client.on("channelCreate", (ch) => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", (ch) => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});

// Role
client.on("roleCreate", (r) => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", (r) => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
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
