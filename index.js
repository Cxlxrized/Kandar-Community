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
  ChannelType
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
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback abfragen")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true)),

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
});

// === Welcome ===
client.on("guildMemberAdd", async (member) => {
  const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du da bist! 🎉`)
    .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");
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
    .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");
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
        .setDescription(`Klicke unten, um **${amount}€** zu zahlen.`)
        .setFooter({ text: "Kandar Community" });
      const btn = new ButtonBuilder().setLabel(`Jetzt ${amount}€ zahlen`).setStyle(ButtonStyle.Link).setURL(link);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    // === Ticket Panel ===
    if (i.isChatInputCommand() && i.commandName === "ticketmsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Für Grafiker\n` +
          `✂️ **Cutter Bewerbung** – Für Videoeditoren\n` +
          `🛠️ **Highteam Anliegen** – Interne Anliegen`
        )
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_shop").setLabel("💰 Shop Ticket").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("ticket_streamer").setLabel("🎥 Streamer Bewerbung").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_kandar").setLabel("✍️ Kandar Bewerbung").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_designer").setLabel("🎨 Designer Bewerbung").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_cutter").setLabel("✂️ Cutter Bewerbung").setStyle(ButtonStyle.Secondary)
      );
      return i.reply({ embeds: [embed], components: [row] });
    }

    // === Nuke ===
    if (i.isChatInputCommand() && i.commandName === "nuke") {
      const channel = i.channel;
      await i.reply({ content: "⚠️ Nuking wird ausgeführt...", flags: 64 });
      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        await channel.bulkDelete(fetched, true);
      } while (fetched.size >= 2);
      await channel.send("✅ Channel wurde genukt!");
    }

    // === Ticket Modals ===
    const createTicket = async (i, categoryName, title, description) => {
      const guild = i.guild;
      let cat = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
      if (!cat) cat = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
      const ch = await guild.channels.create({
        name: `${title}-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });
      const embed = new EmbedBuilder().setColor("#00FF00").setTitle(title).setDescription(description).setTimestamp();
      await ch.send({ content: `${i.user}`, embeds: [embed] });

      const log = guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);
      if (log) log.send({ embeds: [embed.setTitle(`🧾 ${title} erstellt von ${i.user.username}`)] });
      return ch;
    };

    // Shop Modal
    if (i.isButton() && i.customId === "ticket_shop") {
      const modal = new ModalBuilder().setCustomId("modal_shop").setTitle("Shop Ticket erstellen");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("artikel").setLabel("Artikel").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode").setStyle(TextInputStyle.Short).setRequired(true))
      );
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId === "modal_shop") {
      const artikel = i.fields.getTextInputValue("artikel");
      const payment = i.fields.getTextInputValue("payment");
      await createTicket(i, "💰 Shop Tickets", "💰 Shop Ticket", `**Artikel:** ${artikel}\n**Payment:** ${payment}`);
      return i.reply({ content: "✅ Shop Ticket erstellt!", flags: 64 });
    }

    // Streamer Modal
    if (i.isButton() && i.customId === "ticket_streamer") {
      const modal = new ModalBuilder().setCustomId("modal_streamer").setTitle("Streamer Bewerbung");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("average").setLabel("Average Viewer").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("twitch").setLabel("Twitch Link").setStyle(TextInputStyle.Short).setRequired(true))
      );
      return i.showModal(modal);
    }
    if (i.isModalSubmit() && i.customId === "modal_streamer") {
      const follower = i.fields.getTextInputValue("follower");
      const average = i.fields.getTextInputValue("average");
      const twitch = i.fields.getTextInputValue("twitch");
      await createTicket(i, "🎥 Streamer Bewerbungen", "🎥 Streamer Bewerbung", `**Follower:** ${follower}\n**Average Viewer:** ${average}\n**Twitch:** ${twitch}`);
      return i.reply({ content: "✅ Streamer Bewerbung erstellt!", flags: 64 });
    }

    // Weitere Ticketarten ohne Modals
    if (i.isButton() && i.customId === "ticket_kandar")
      return createTicket(i, "✍️ Kandar Bewerbungen", "✍️ Kandar Bewerbung", "Bitte schreibe deine Bewerbung hier.");
    if (i.isButton() && i.customId === "ticket_designer")
      return createTicket(i, "🎨 Designer Bewerbungen", "🎨 Designer Bewerbung", "Bitte sende dein Portfolio und Beispielarbeiten.");
    if (i.isButton() && i.customId === "ticket_cutter")
      return createTicket(i, "✂️ Cutter Bewerbungen", "✂️ Cutter Bewerbung", "Bitte nenne deine Software & Erfahrung.");

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

// === Login ===
client.login(process.env.DISCORD_TOKEN);


