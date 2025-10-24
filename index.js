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
  StringSelectMenuBuilder
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
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");

/* ===========================
   Slash Commands
=========================== */
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o =>
      o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Sendet das Ticket-Panel (Dropdown)"),

  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht viele Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System verwalten")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")
    ),

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
   Giveaway Utils
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

/* ===========================
   Ready Event
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
});

/* ===========================
   Welcome + Booster
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

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
   Ticket System Helper
=========================== */
async function sendTicketControls(channel, user) {
  const closeBtn = new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("🔒 Schließen")
    .setStyle(ButtonStyle.Secondary);
  const transcriptBtn = new ButtonBuilder()
    .setCustomId("ticket_transcript")
    .setLabel("🧾 Transkript")
    .setStyle(ButtonStyle.Primary);
  const deleteBtn = new ButtonBuilder()
    .setCustomId("ticket_delete")
    .setLabel("❌ Löschen")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(closeBtn, transcriptBtn, deleteBtn);
  await channel.send({
    content: `${user}`,
    embeds: [
      new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Ticket Steuerung")
        .setDescription("Verwende die Buttons, um das Ticket zu verwalten."),
    ],
    components: [row],
  });
}

/* ===========================
   Interactions
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- PANEL ---- */
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
          `👥 **Support Anliegen** – Hilfe oder Fragen`
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

    /* ---- Ticket Auswahl ---- */
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];
      const guild = i.guild;

      const map = {
        kandar: { title: "✍️ Kandar Bewerbung", cat: "✍️ Kandar Bewerbungen", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter: { title: "✂️ Cutter Bewerbung", cat: "✂️ Cutter Bewerbungen", desc: "Bitte nenne Software & Erfahrung." },
        highteam: { title: "🛠️ Highteam Ticket", cat: "🛠️ Highteam Anliegen", desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket", cat: "👥 Support Tickets", desc: "Bitte beschreibe dein Anliegen." },
      };
      const data = map[choice];
      if (!data && choice !== "shop" && choice !== "streamer") return;

      // SHOP Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
        const pay = new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode").setStyle(TextInputStyle.Short).setRequired(true);
        const item = new TextInputBuilder().setCustomId("item").setLabel("Artikel").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(pay), new ActionRowBuilder().addComponents(item));
        return i.showModal(modal);
      }

      // STREAMER Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        const follower = new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true);
        const viewer = new TextInputBuilder().setCustomId("viewer").setLabel("Average Viewer").setStyle(TextInputStyle.Short).setRequired(true);
        const twitch = new TextInputBuilder().setCustomId("twitch").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(follower),
          new ActionRowBuilder().addComponents(viewer),
          new ActionRowBuilder().addComponents(twitch)
        );
        return i.showModal(modal);
      }

      // Normales Ticket
      const catName = data.cat;
      let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
      const ch = await guild.channels.create({
        name: `${data.title.split(" ")[0]}-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });
      await ch.send({
        content: `${i.user}`,
        embeds: [new EmbedBuilder().setColor("#00FF00").setTitle(data.title).setDescription(data.desc)],
      });
      await sendTicketControls(ch, i.user);
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- SHOP / STREAMER Modal ---- */
    if (i.isModalSubmit() && i.customId === "shopTicketModal") {
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
      const payment = i.fields.getTextInputValue("payment");
      const item = i.fields.getTextInputValue("item");
      const embed = new EmbedBuilder().setColor("#00FF00").setTitle("💰 Shop Ticket").setDescription(`🧾 Zahlungsmethode: ${payment}\n📦 Artikel: ${item}`);
      await ch.send({ content: `${i.user}`, embeds: [embed] });
      await sendTicketControls(ch, i.user);
      return i.reply({ content: `✅ Shop Ticket erstellt: ${ch}`, ephemeral: true });
    }

    if (i.isModalSubmit() && i.customId === "streamerTicketModal") {
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
      const f = i.fields.getTextInputValue("follower");
      const v = i.fields.getTextInputValue("viewer");
      const t = i.fields.getTextInputValue("twitch");
      const embed = new EmbedBuilder().setColor("#00FF88").setTitle("🎥 Streamer Bewerbung").setDescription(`👤 Follower: ${f}\n📈 Average Viewer: ${v}\n🔗 Twitch: ${t}`);
      await ch.send({ content: `${i.user}`, embeds: [embed] });
      await sendTicketControls(ch, i.user);
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- Ticket Buttons ---- */
    if (i.isButton() && i.customId === "ticket_close") {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return i.reply({ content: "❌ Nur Teammitglieder können Tickets schließen!", ephemeral: true });
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false });
      await i.reply({ content: "🔒 Ticket geschlossen!", ephemeral: true });
    }

    if (i.isButton() && i.customId === "ticket_transcript") {
      const msgs = await i.channel.messages.fetch({ limit: 100 });
      const sorted = msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const content = sorted.map(m => `${m.author.tag}: ${m.content}`).join("\n");
      const file = `./data/transcript_${i.channel.id}.txt`;
      fs.writeFileSync(file, content || "Keine Nachrichten.");
      const logCh = i.guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);
      if (logCh) await logCh.send({ content: `🧾 Transkript ${i.channel.name}`, files: [file] });
      await i.reply({ content: "🧾 Transkript wurde erstellt!", files: [file], ephemeral: true });
      setTimeout(() => fs.unlinkSync(file), 10000);
    }

    if (i.isButton() && i.customId === "ticket_delete") {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return i.reply({ content: "❌ Nur Teammitglieder können löschen!", ephemeral: true });
      await i.reply({ content: "🗑 Ticket wird gelöscht...", ephemeral: true });
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    console.error(err);
  }
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);




