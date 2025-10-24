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
    .setName("nuke")
    .setDescription("Löscht viele Nachrichten im aktuellen Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
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

// === Ready Event ===
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.log("⚠️ Keine Guild gefunden!");

  // === Server Stats Kategorie ===
  const categoryName = "📊 Server Stats";
  let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
  if (!category) {
    category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
    console.log("📈 Kategorie 'Server Stats' erstellt!");
  }

  const stats = {
    members: "🧍‍♂️ Mitglieder",
    online: "💻 Online",
    bots: "🤖 Bots",
    boosts: "💎 Boosts"
  };

  for (const [key, name] of Object.entries(stats)) {
    let ch = guild.channels.cache.find(c => c.parentId === category.id && c.name.startsWith(name));
    if (!ch) {
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

  await updateStats();
  setInterval(updateStats, 5 * 60 * 1000);
  console.log("📊 Server Stats aktiv!");
});

// === Welcome Embed ===
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

// === Booster Embed ===
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
    // === PAYPAL ===
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag");
      if (!amount || amount <= 0)
        return i.reply({ content: "⚠️ Ungültiger Betrag!", flags: 64 });
      const link = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${amount}€** zu zahlen.`)
        .setFooter({ text: "Kandar Community" });
      const btn = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    // === Ticket Panel (Dropdown) ===
    if (i.isChatInputCommand() && i.commandName === "ticketmsg") {
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
          `🛠️ **Highteam Anliegen** – Interne Anliegen`
        )
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");

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
        ]);

      const row = new ActionRowBuilder().addComponents(menu);
      return i.reply({ embeds: [embed], components: [row] });
    }

    // === Dropdown Auswahl ===
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      const modalHandler = async (modalId, title, fields) => {
        const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);
        modal.addComponents(fields.map(f =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(true)
          )
        ));
        return i.showModal(modal);
      };

      if (choice === "shop")
        return modalHandler("modal_shop", "Shop Ticket erstellen", [
          { id: "artikel", label: "Artikel", style: TextInputStyle.Short },
          { id: "payment", label: "Zahlungsmethode", style: TextInputStyle.Short }
        ]);

      if (choice === "streamer")
        return modalHandler("modal_streamer", "Streamer Bewerbung", [
          { id: "follower", label: "Follower", style: TextInputStyle.Short },
          { id: "average", label: "Average Viewer", style: TextInputStyle.Short },
          { id: "twitch", label: "Twitch Link", style: TextInputStyle.Short }
        ]);

      const map = {
        kandar: { cat: "✍️ Kandar Bewerbungen", title: "✍️ Kandar Bewerbung", desc: "Bitte schreibe deine Bewerbung hier." },
        designer: { cat: "🎨 Designer Bewerbungen", title: "🎨 Designer Bewerbung", desc: "Bitte sende dein Portfolio." },
        cutter: { cat: "✂️ Cutter Bewerbungen", title: "✂️ Cutter Bewerbung", desc: "Bitte nenne deine Software & Erfahrung." },
        highteam: { cat: "🛠️ Highteam Anliegen", title: "🛠️ Highteam Ticket", desc: "Beschreibe bitte dein Anliegen." },
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
      await ch.send({ content: `${i.user}`, embeds: [embed] });
      const log = guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);
      if (log) log.send({ embeds: [embed.setTitle(`🧾 ${data.title} erstellt von ${i.user.username}`)] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, flags: 64 });
    }

    // === Modals Submit ===
    if (i.isModalSubmit()) {
      const guild = i.guild;
      let embed;
      let catName;
      if (i.customId === "modal_shop") {
        const artikel = i.fields.getTextInputValue("artikel");
        const payment = i.fields.getTextInputValue("payment");
        embed = new EmbedBuilder().setColor("#00FF00").setTitle("💰 Shop Ticket").setDescription(`**Artikel:** ${artikel}\n**Zahlungsmethode:** ${payment}`);
        catName = "💰 Shop Tickets";
      }
      if (i.customId === "modal_streamer") {
        const follower = i.fields.getTextInputValue("follower");
        const average = i.fields.getTextInputValue("average");
        const twitch = i.fields.getTextInputValue("twitch");
        embed = new EmbedBuilder().setColor("#00FF88").setTitle("🎥 Streamer Bewerbung").setDescription(`**Follower:** ${follower}\n**Average Viewer:** ${average}\n**Twitch:** ${twitch}`);
        catName = "🎥 Streamer Bewerbungen";
      }
      if (!embed || !catName) return;

      let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: `${embed.data.title.split(" ")[0]}-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      await ch.send({ content: `${i.user}`, embeds: [embed] });
      const log = guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);
      if (log) log.send({ embeds: [embed.setTitle(`🧾 Neues Ticket von ${i.user.username}`)] });
      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, flags: 64 });
    }

    // === Nuke ===
    if (i.isChatInputCommand() && i.commandName === "nuke") {
      const ch = i.channel;
      await i.reply({ content: "⚠️ Channel wird geleert...", flags: 64 });
      let msgs;
      do {
        msgs = await ch.messages.fetch({ limit: 100 });
        await ch.bulkDelete(msgs, true);
      } while (msgs.size >= 2);
      await ch.send("✅ Channel erfolgreich genukt!");
    }

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

// === LOGGING SYSTEM ===

// Member Logs
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`)] });
});

client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`)] });
});

// Message Logs
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Nachricht gelöscht")
    .setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`);
  log.send({ embeds: [embed] });
});

// Channel Logs
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("📢 Channel erstellt").setDescription(`${ch.name}`)] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`)] });
});

// Role Logs
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`)] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log) log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`)] });
});

// Server Logs
client.on("guildUpdate", (oldG, newG) => {
  const log = newG.channels.cache.get(process.env.SERVER_LOGS_CHANNEL_ID);
  if (!log) return;
  const changes = [];
  if (oldG.name !== newG.name) changes.push(`📛 Name geändert: **${oldG.name} → ${newG.name}**`);
  if (oldG.icon !== newG.icon) changes.push(`🖼️ Servericon geändert.`);
  if (changes.length) log.send({ embeds: [new EmbedBuilder().setColor("#FFD700").setTitle("⚙️ Server geändert").setDescription(changes.join("\n"))] });
});

// Voice Logs
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


