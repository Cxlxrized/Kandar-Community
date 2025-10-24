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

// === Client ===
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

// === Files ===
const GIVEAWAY_FILE = "./data/giveaways.json";
if (!fs.existsSync("./data")) fs.mkdirSync("./data");

// === Slash Commands ===
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o => o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ticketmsg")
    .setDescription("Sendet das Ticket-Panel"),

  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht alle Nachrichten im Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System verwalten")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")
    ),

  // === Giveaway Commands ===
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Starte ein neues Giveaway")
    .addStringOption(o => o.setName("preis").setDescription("Preis des Giveaways").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("Dauer (z. B. 1d, 2h, 30m)").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl der Gewinner").setRequired(false)),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Wähle einen neuen Gewinner")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true))
].map(c => c.toJSON());

// === Commands registrieren ===
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

// === Helper für Giveaways ===
function parseDuration(str) {
  const regex = /(\d+d)?(\d+h)?(\d+m)?/;
  const match = str.match(regex);
  if (!match) return null;
  let ms = 0;
  if (match[1]) ms += parseInt(match[1]) * 86400000;
  if (match[2]) ms += parseInt(match[2]) * 3600000;
  if (match[3]) ms += parseInt(match[3]) * 60000;
  return ms;
}
function loadGiveaways() {
  if (!fs.existsSync(GIVEAWAY_FILE)) return [];
  return JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
}
function saveGiveaways(data) {
  fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(data, null, 2));
}

// === Ready ===
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // === Server Stats Kategorie ===
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

  for (const [_, name] of Object.entries(stats)) {
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
  console.log("📊 Server Stats aktiv!");
});

// === Welcome & Booster ===
client.on("guildMemberAdd", async (member) => {
  const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du da bist! 🎉`)
    .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif")
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
    .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif")
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

// === Interactions ===
client.on("interactionCreate", async (i) => {
  try {
    // Alle bisherigen Systeme (Verify, Tickets, Creator, PayPal, Nuke etc.)
    // ... [Dein bisheriger Ticket/Verify/Creator Code bleibt unverändert hier]

    // === GIVEAWAY ===
    if (i.isChatInputCommand() && i.commandName === "giveaway") {
      const preis = i.options.getString("preis");
      const dauerStr = i.options.getString("dauer");
      const gewinner = i.options.getInteger("gewinner") || 1;
      const dauer = parseDuration(dauerStr);
      if (!dauer || dauer <= 0)
        return i.reply({ content: "⚠️ Ungültige Zeitangabe! Beispiel: 1d2h30m", ephemeral: true });

      const endZeit = Date.now() + dauer;
      const embed = new EmbedBuilder()
        .setColor("#9B5DE5")
        .setTitle("🎉 Neues Giveaway 🎉")
        .setDescription(
          `**Preis:** ${preis}\n🎁 **Anzahl Gewinner:** ${gewinner}\n⏰ **Endet in:** ${dauerStr}\n\nDrücke auf den Button, um teilzunehmen!`
        )
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif")
        .setTimestamp(new Date(endZeit))
        .setFooter({ text: "Endet" });

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

      setTimeout(() => endGiveaway(msg.id), dauer);
    }

    if (i.isButton() && i.customId === "giveaway_join") {
      const giveaways = loadGiveaways();
      const g = giveaways.find(x => x.messageId === i.message.id);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.beendet) return i.reply({ content: "🚫 Dieses Giveaway ist beendet!", ephemeral: true });
      if (g.teilnehmer.includes(i.user.id))
        return i.reply({ content: "⚠️ Du nimmst bereits teil!", ephemeral: true });

      g.teilnehmer.push(i.user.id);
      saveGiveaways(giveaways);
      return i.reply({ content: "✅ Du nimmst am Giveaway teil!", ephemeral: true });
    }

    if (i.isChatInputCommand() && i.commandName === "reroll") {
      const msgid = i.options.getString("msgid");
      const giveaways = loadGiveaways();
      const g = giveaways.find(x => x.messageId === msgid);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (g.teilnehmer.length === 0)
        return i.reply({ content: "😢 Keine Teilnehmer!", ephemeral: true });

      const winner = `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`;
      i.reply(`🔁 Neuer Gewinner für **${g.preis}**: ${winner}`);
    }

    if (i.isChatInputCommand() && i.commandName === "end") {
      const msgid = i.options.getString("msgid");
      await endGiveaway(msgid, i);
    }
  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

// === Giveaway beenden ===
async function endGiveaway(msgid, interaction = null) {
  const giveaways = loadGiveaways();
  const g = giveaways.find(x => x.messageId === msgid);
  if (!g || g.beendet) return;
  g.beendet = true;
  saveGiveaways(giveaways);

  try {
    const guild = await client.guilds.fetch(g.guildId);
    const channel = await guild.channels.fetch(g.channelId);
    const msg = await channel.messages.fetch(g.messageId);

    if (g.teilnehmer.length === 0) {
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor("#808080")
        .setDescription(`**Preis:** ${g.preis}\n\n❌ Keine Teilnehmer 😢`)
        .setFooter({ text: "Giveaway beendet" });
      await msg.edit({ embeds: [embed], components: [] });
      if (interaction) interaction.reply({ content: "❌ Keine Teilnehmer.", ephemeral: true });
      return;
    }

    const winners = [];
    for (let n = 0; n < g.gewinner; n++) {
      const random = g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)];
      winners.push(`<@${random}>`);
    }

    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n🏆 **Gewinner:** ${winners.join(", ")}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await channel.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden:", err);
  }
}

// === Logging-System ===
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

// === Login ===
client.login(process.env.DISCORD_TOKEN);




