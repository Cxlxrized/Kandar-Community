// index.js — Teil 1/2
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
   Konstanten / Branding
=========================== */
const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";
const BRAND_FOOTER = "Kandar";
const STREAM_FOOTER = "Kandar Streaming";
const SHOP_FOOTER = "Kandar Shop";

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
const ORDERS_FILE = "./data/orders.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");
if (!fs.existsSync(CREATORS_FILE)) fs.writeFileSync(CREATORS_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const saveJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));

/* ===========================
   Slash Commands (alle)
=========================== */
const commands = [
  // PayPal
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o => o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)),

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
    .addSubcommand(sub => sub.setName("add").setDescription("Erstellt ein Creator-Panel mit Social-Links")),

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

  // Twitch Announce
  new SlashCommandBuilder()
    .setName("stream")
    .setDescription("Postet einen Twitch Live-Announce (manuell)"),

  // Finish + Feedback (nur bestimmte Rollen)
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback anstoßen (nur Staff)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ORDER System (ohne Ticket, im Channel)
  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt/verwaltet eine Bestellung im Channel (kein Ticket)")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Erster Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis (€) des Artikels").setRequired(true)),
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
    console.log("✅ Slash Commands registriert!");
  } catch (err) {
    console.error("❌ Fehler beim Registrieren:", err);
  }
})();

/* ===========================
   Utils (Giveaway)
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

/* ===========================
   Ready: Server Stats + Re-Arm Giveaways
=========================== */
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    // Server Stats
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
    .setFooter({ text: BRAND_FOOTER })
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
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  ch.send({ embeds: [embed] });
});

/* ===========================
   Interaction Handler (alles in einem Listener)
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ---- VERIFY PANEL + BUTTON ---- */
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
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      if (i.member.roles.cache.has(role.id))
        return i.reply({ content: "✅ Du bist bereits verifiziert!", ephemeral: true });

      await i.member.roles.add(role);
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
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
        .setFooter({ text: BRAND_FOOTER });
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
          `🛠️ **Highteam Anliegen** – Interne Anliegen\n`+
          `👥 **Support Anliegen** – Allgemeiner Support\n`
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

    // Dropdown -> ggf. Modals/Channel erstellen
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

      // Andere Kategorien: Direkt Channel
      const map = {
        kandar:  { title: "✍️ Kandar Bewerbung",  cat: "✍️ Kandar Bewerbungen",  desc: "Bitte schreibe deine Bewerbung hier." },
        designer:{ title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter:  { title: "✂️ Cutter Bewerbung",   cat: "✂️ Cutter Bewerbungen",   desc: "Bitte nenne Software & Erfahrung." },
        highteam:{ title: "🛠️ Highteam Ticket",    cat: "🛠️ Highteam Anliegen",    desc: "Beschreibe bitte dein Anliegen." },
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
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ],
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(data.title)
        .setDescription(data.desc)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("💰 Shop Ticket")
        .setDescription(`🧾 **Zahlungsmethode:** ${payment}\n📦 **Artikel:** ${item}`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
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

      const ticketEmbed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("🎥 Streamer Bewerbung")
        .setDescription(`👤 **Follower:** ${follower}\n📈 **Average Viewer:** ${avgViewer}\n🔗 **Twitch:** ${twitch}`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Ticket schließen")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);

      await ch.send({ content: `${i.user}`, embeds: [ticketEmbed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* ---- TICKET CLOSE: Button -> Modal Grund ---- */
    if (i.isButton() && i.customId === "ticket_close") {
      const modal = new ModalBuilder()
        .setCustomId("ticketCloseReason")
        .setTitle("Ticket schließen – Grund");

      const reason = new TextInputBuilder()
        .setCustomId("close_reason")
        .setLabel("Grund des Schließens")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "ticketCloseReason") {
      const reason = i.fields.getTextInputValue("close_reason");
      const ch = i.channel;

      // Schließen-Embed (rot) + Banner
      const closedEmbed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`**Grund:** ${reason}`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      await ch.send({ embeds: [closedEmbed] });

      // Kanal sperren & nach 5 Sekunden löschen
      try {
        await ch.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false, SendMessages: false });
      } catch {}
      setTimeout(() => ch.delete().catch(() => {}), 5000);

      return i.reply({ content: "✅ Ticket wird geschlossen…", ephemeral: true });
    }

    /* ---- FINISH + FEEDBACK ---- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Staff only (ManageMessages gesetzt beim Command)
      const feedbackBtn = new ButtonBuilder()
        .setCustomId("feedback_open")
        .setLabel("Feedback abgeben")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Primary);

      const finishEmbed = new EmbedBuilder()
        .setColor("#FF0000") // rot gewünscht
        .setTitle("✅ Bestellung abgeschlossen")
        .setDescription(`Der Verkäufer hat die Bestellung abgeschlossen.\nBitte gib uns **Feedback**!`)
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER });

      // Kunde markieren: Falls im Ticket, meist erster Mention im Verlauf – wir markieren den Channel-Ersteller (falls Format wie oben).
      // Hier alternativ: letzten Ticket-Eröffner aus Topic? Da wir es simpel halten:
      await i.reply({ content: "✅ Abgeschlossen. Button für Feedback wurde gesendet.", ephemeral: true });
      await i.channel.send({ embeds: [finishEmbed], components: [new ActionRowBuilder().addComponents(feedbackBtn)] });

      // Optional: Kunde Rolle "Customer"
      const customerRoleId = process.env.CUSTOMER_ROLE_ID;
      if (customerRoleId) {
        try {
          // Versuche den Thread-Ersteller / zuletzt erwähnten User im Channel-Verlauf zu finden
          const msgs = await i.channel.messages.fetch({ limit: 20 }).catch(() => null);
          const firstMention = msgs ? msgs.find(m => m.mentions.users.size > 0) : null;
          const targetUser = firstMention ? firstMention.mentions.users.first() : null;
          if (targetUser) {
            const mem = await i.guild.members.fetch(targetUser.id).catch(() => null);
            if (mem) await mem.roles.add(customerRoleId).catch(() => null);
          }
        } catch {}
      }
    }

    // Feedback Button -> Modal (Sterne + Text), Verkäufer-Auswahl kommt im 2. Schritt (UserSelect)
    if (i.isButton() && i.customId === "feedback_open") {
      const modal = new ModalBuilder()
        .setCustomId("feedback_modal_stage1")
        .setTitle("Feedback abgeben");

      const stars = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("⭐ Sterne (1-5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const text = new TextInputBuilder()
        .setCustomId("text")
        .setLabel("📝 Dein Feedback")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(stars),
        new ActionRowBuilder().addComponents(text),
      );

      return i.showModal(modal);
    }

    // Feedback Modal (Stage 1) -> User Select für Verkäufer
    if (i.isModalSubmit() && i.customId === "feedback_modal_stage1") {
      const stars = i.fields.getTextInputValue("stars").trim();
      const text = i.fields.getTextInputValue("text").trim();

      // Speichere temporär im CustomId-Token (oder in Map). Hier als ephemeral state über followUp mit customId.
      const stateId = `fb_${i.id}`; // unique
      client.fbTemp = client.fbTemp || new Map();
      client.fbTemp.set(stateId, { stars, text, channelId: i.channel.id });

      const userSelect = new UserSelectMenuBuilder()
        .setCustomId(`feedback_pick_seller:${stateId}`)
        .setPlaceholder("👤 Verkäufer auswählen")
        .setMinValues(1)
        .setMaxValues(1);

      await i.reply({
        content: "Bitte wähle den **Verkäufer** aus:",
        components: [new ActionRowBuilder().addComponents(userSelect)],
        ephemeral: true
      });
    }

    // Verkäufer gewählt -> Feedback posten
    if (i.isUserSelectMenu() && i.customId.startsWith("feedback_pick_seller:")) {
      const stateId = i.customId.split(":")[1];
      client.fbTemp = client.fbTemp || new Map();
      const state = client.fbTemp.get(stateId);
      if (!state) return i.reply({ content: "❌ Feedback-Daten nicht gefunden.", ephemeral: true });

      const sellerId = i.values[0];
      const starsNum = Math.max(1, Math.min(5, parseInt(state.stars)));
      const starsStr = "⭐".repeat(starsNum) + "☆".repeat(5 - starsNum);

      const feedbackChannel = i.guild.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID);
      if (!feedbackChannel) return i.reply({ content: "❌ Feedback-Channel nicht gefunden.", ephemeral: true });

      const fbEmbed = new EmbedBuilder()
        .setColor("#FF0000") // rot
        .setTitle("📝 Neues Feedback")
        .setDescription(
          `**Bewertung:** ${starsStr}\n\n` +
          `**Kommentar:** ${state.text}\n\n` +
          `**Verkäufer:** <@${sellerId}>`
        )
        .setImage(BANNER_URL)
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      await feedbackChannel.send({ embeds: [fbEmbed] });
      client.fbTemp.delete(stateId);
      return i.reply({ content: "✅ Danke! Dein Feedback wurde gesendet.", ephemeral: true });
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

      const member = await guild.members.fetch(creatorId).catch(() => null);
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

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});
// index.js — Teil 2/2 (fortgesetzt)


/* ===========================
   ORDER SYSTEM (ohne Ticket)
=========================== */
// State in Datei: messageId -> order
const getOrders = () => JSON.parse(fs.readFileSync("./data/orders.json", "utf8"));
const setOrders = (o) => fs.writeFileSync("./data/orders.json", JSON.stringify(o, null, 2));

client.on("interactionCreate", async (i) => {
  try {
    // /order neues Embed + Dropdown
    if (i.isChatInputCommand() && i.commandName === "order") {
      const kunde = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preis = i.options.getNumber("preis");

      const orderEmbed = new EmbedBuilder()
        .setColor("#00AA88")
        .setTitle(`🛒 Bestellung von ${kunde.username}`)
        .setDescription(`**🧾 Artikel:** ${artikel}\n**💶 Preis:** ${preis.toFixed(2)}€\n\n**🧺 Warenkorb:**\n• ${artikel} — ${preis.toFixed(2)}€\n\n**Summe:** ${preis.toFixed(2)}€`)
        .setImage(BANNER_URL)
        .setFooter({ text: SHOP_FOOTER });

      const addBtn = new ButtonBuilder()
        .setCustomId("order_add_item")
        .setLabel("Artikel hinzufügen")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary);

      const finishBtn = new ButtonBuilder()
        .setCustomId("order_finish")
        .setLabel("Bestellung abschließen")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

      const msg = await i.reply({
        embeds: [orderEmbed],
        components: [new ActionRowBuilder().addComponents(addBtn, finishBtn)],
        fetchReply: true
      });

      const orders = getOrders();
      orders.push({
        messageId: msg.id,
        channelId: msg.channel.id,
        guildId: msg.guild.id,
        customerId: kunde.id,
        items: [{ name: artikel, price: preis }],
      });
      setOrders(orders);
    }

    // Add Item -> Modal
    if (i.isButton() && i.customId === "order_add_item") {
      const modal = new ModalBuilder().setCustomId(`order_add_modal:${i.message.id}`).setTitle("Artikel hinzufügen");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("price").setLabel("Preis (€)").setStyle(TextInputStyle.Short).setRequired(true))
      );
      return i.showModal(modal);
    }

    // Add Item submit
    if (i.isModalSubmit() && i.customId.startsWith("order_add_modal:")) {
      const msgId = i.customId.split(":")[1];
      const name = i.fields.getTextInputValue("name").trim();
      const price = parseFloat(i.fields.getTextInputValue("price").replace(",", "."));
      if (!name || isNaN(price) || price < 0) return i.reply({ content: "⚠️ Ungültige Eingabe.", ephemeral: true });

      const orders = getOrders();
      const o = orders.find(x => x.messageId === msgId);
      if (!o) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });

      o.items.push({ name, price });
      setOrders(orders);

      // Embed aktualisieren
      try {
        const ch = await client.channels.fetch(o.channelId);
        const msg = await ch.messages.fetch(o.messageId);
        const sum = o.items.reduce((a, b) => a + b.price, 0);
        const list = o.items.map(it => `• ${it.name} — ${it.price.toFixed(2)}€`).join("\n");
        const updated = EmbedBuilder.from(msg.embeds[0])
          .setDescription(`**🧾 Artikel:** ${o.items[0].name}\n**💶 Preis:** ${o.items[0].price.toFixed(2)}€\n\n**🧺 Warenkorb:**\n${list}\n\n**Summe:** ${sum.toFixed(2)}€`);
        await msg.edit({ embeds: [updated] });
      } catch {}
      return i.reply({ content: "✅ Artikel hinzugefügt.", ephemeral: true });
    }

    // Finish order
    if (i.isButton() && i.customId === "order_finish") {
      const orders = getOrders();
      const o = orders.find(x => x.messageId === i.message.id);
      if (!o) return i.reply({ content: "❌ Bestellung nicht gefunden.", ephemeral: true });

      const sum = o.items.reduce((a, b) => a + b.price, 0);
      const list = o.items.map(it => `• ${it.name} — ${it.price.toFixed(2)}€`).join("\n");

      const fin = EmbedBuilder.from(i.message.embeds[0])
        .setColor("#00AA88")
        .setTitle(`🛒 Bestellung von ${(await client.users.fetch(o.customerId)).username} — Abgeschlossen`)
        .setDescription(`**🧺 Warenkorb:**\n${list}\n\n**Gesamtsumme:** ${sum.toFixed(2)}€\n\n🎉 Vielen Dank für deinen Einkauf!`)
        .setFooter({ text: SHOP_FOOTER });

      await i.message.edit({ embeds: [fin] });
      // Order aus Speicher entfernen (optional)
      setOrders(orders.filter(x => x.messageId !== o.messageId));
      return i.reply({ content: "✅ Bestellung abgeschlossen.", ephemeral: true });
    }

  } catch (err) {
    console.error("❌ Order-Fehler:", err);
  }
});

/* ===========================
   GIVEAWAY: Create, Join (mit Teilnehmerzahl), Reroll, End
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    // /giveaway
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
        .setDescription(`**Preis:** ${preis}\n🎁 **Gewinner:** ${gewinner}\n⏰ **Endet in:** ${dauerStr}\n👥 **Teilnehmer:** 0\n\nKlicke unten, um teilzunehmen!`)
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

    // Teilnahme
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
        const desc = embed.data.description || "";
        const newDesc = desc.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
        embed.setDescription(newDesc);
        await i.message.edit({ embeds: [embed] });
      } catch {}

      return i.reply({ content: "✅ Teilnahme gespeichert!", ephemeral: true });
    }

    // /reroll
    if (i.isChatInputCommand() && i.commandName === "reroll") {
      const msgid = i.options.getString("msgid");
      const g = loadGiveaways().find(x => x.messageId === msgid);
      if (!g) return i.reply({ content: "❌ Giveaway nicht gefunden!", ephemeral: true });
      if (!g.teilnehmer.length) return i.reply({ content: "😢 Keine Teilnehmer!", ephemeral: true });

      const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
      return i.reply(`🔁 Neue Gewinner für **${g.preis}**: ${winners.join(", ")}`);
    }

    // /end
    if (i.isChatInputCommand() && i.commandName === "end") {
      await endGiveaway(i.options.getString("msgid"), i);
    }

  } catch (err) {
    console.error("❌ Giveaway-Interaktionsfehler:", err);
  }
});

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
      .setDescription(`**Preis:** ${g.preis}\n🏆 **Gewinner:** ${winners.join(", ")}\n👥 **Teilnehmer:** ${g.teilnehmer.length}`)
      .setFooter({ text: "Giveaway beendet" });

    await msg.edit({ embeds: [embed], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* ===========================
   Twitch Announce (manuell)
=========================== */
client.on("interactionCreate", async (i) => {
  if (i.isChatInputCommand() && i.commandName === "stream") {
    const user = process.env.TWITCH_STREAMER || "cxlxrized_";
    const preview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(user)}-1280x720.jpg`;

    const embed = new EmbedBuilder()
      .setColor("#9146FF")
      .setTitle(`🔴 ${user} ist jetzt LIVE!`)
      .setDescription(`Kommt vorbei und sagt hallo! 😎🎮\nhttps://twitch.tv/${user}`)
      .setImage(preview)
      .setFooter({ text: STREAM_FOOTER })
      .setTimestamp();

    await i.reply({ embeds: [embed] });
  }
});

/* ===========================
   NUKE
=========================== */
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

/* ===========================
   Logging System
=========================== */
// Member
client.on("guildMemberAdd", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("👋 Neues Mitglied").setDescription(`${m} ist beigetreten.`).setFooter({ text: BRAND_FOOTER })] });
});
client.on("guildMemberRemove", m => {
  const log = m.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🚪 Mitglied hat verlassen").setDescription(`${m.user.tag} hat den Server verlassen.`).setFooter({ text: BRAND_FOOTER })] });
});

// Message (gelöscht)
client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (log) {
    const embed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🗑 Nachricht gelöscht")
      .setDescription(`Von ${msg.author}\nIn ${msg.channel}\n\n${msg.content || "[Embed/Datei]"}`)
      .setFooter({ text: BRAND_FOOTER });
    log.send({ embeds: [embed] });
  }
});

// Channel
client.on("channelCreate", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("📢 Channel erstellt").setDescription(`${ch.name}`).setFooter({ text: BRAND_FOOTER })] });
});
client.on("channelDelete", ch => {
  const log = ch.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🗑 Channel gelöscht").setDescription(`${ch.name}`).setFooter({ text: BRAND_FOOTER })] });
});

// Role
client.on("roleCreate", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#00FF00").setTitle("🎭 Rolle erstellt").setDescription(`${r.name}`).setFooter({ text: BRAND_FOOTER })] });
});
client.on("roleDelete", r => {
  const log = r.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (log)
    log.send({ embeds: [new EmbedBuilder().setColor("#FF0000").setTitle("🎭 Rolle gelöscht").setDescription(`${r.name}`).setFooter({ text: BRAND_FOOTER })] });
});

// Voice
client.on("voiceStateUpdate", (o, n) => {
  const log = n.guild.channels.cache.get(process.env.VOICE_LOGS_CHANNEL_ID);
  if (!log) return;
  let desc = "";
  const user = n.member?.user;
  if (!user) return;
  if (!o.channel && n.channel) desc = `🎙️ ${user} ist **${n.channel.name}** beigetreten.`;
  else if (o.channel && !n.channel) desc = `🔇 ${user} hat **${o.channel.name}** verlassen.`;
  else if (o.channelId !== n.channelId) desc = `🔁 ${user} wechselte von **${o.channel.name}** zu **${n.channel.name}**.`;
  if (desc) log.send({ embeds: [new EmbedBuilder().setColor("#00A8FF").setTitle("🔊 Voice Log").setDescription(desc).setFooter({ text: BRAND_FOOTER })] });
});

/* ===========================
   Login
=========================== */
client.login(process.env.DISCORD_TOKEN);

