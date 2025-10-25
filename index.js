// ============== IMPORTS ==============
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

// ============== CLIENT & DATA ==============
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
const DATA_GIVEAWAYS = "./data/giveaways.json";
const DATA_CREATORS  = "./data/creators.json";
if (!fs.existsSync(DATA_GIVEAWAYS)) fs.writeFileSync(DATA_GIVEAWAYS, "[]");
if (!fs.existsSync(DATA_CREATORS))  fs.writeFileSync(DATA_CREATORS,  "[]");

const BANNER_URL = "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif";

// ============== SLASH COMMANDS ==============
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o => o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)),

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
    .addSubcommand(sub => sub
      .setName("add")
      .setDescription("Erstellt ein Creator-Panel mit Social-Links")
    ),

  // Giveaways
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Starte ein neues Giveaway")
    .addStringOption(o => o.setName("preis").setDescription("Preis").setRequired(true))
    .addStringOption(o => o.setName("dauer").setDescription("z. B. 1d, 2h, 30m").setRequired(true))
    .addIntegerOption(o => o.setName("gewinner").setDescription("Anzahl Gewinner").setRequired(true)),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Ziehe neue Gewinner für ein Giveaway")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Beende ein Giveaway vorzeitig")
    .addStringOption(o => o.setName("msgid").setDescription("Nachrichten-ID des Giveaways").setRequired(true)),

  // Twitch Stream Announce
  new SlashCommandBuilder()
    .setName("stream")
    .setDescription("Postet ein Twitch-Announce-Embed für den konfigurierten Nutzer"),

  // Finish (rollenbeschränkt)
  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback anstoßen")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde, der bedient wurde").setRequired(true)),
].map(c => c.toJSON());

// ============== REGISTER COMMANDS ==============
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

// ============== UTILS ==============
const loadGiveaways = () => JSON.parse(fs.readFileSync(DATA_GIVEAWAYS, "utf8"));
const saveGiveaways = (arr) => fs.writeFileSync(DATA_GIVEAWAYS, JSON.stringify(arr, null, 2));

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

function twitchPreview(login) {
  return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login.toLowerCase()}-1280x720.jpg`;
}

// ============== READY: Server Stats + Re-Arm Giveaways ==============
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  // Server Stats Kategorie
  const categoryName = "📊 Server Stats";
  let category = guild.channels.cache.find(c => c.name === categoryName && c.type === ChannelType.GuildCategory);
  if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });

  const stats = {
    members: "🧍‍♂️ Mitglieder",
    online:  "💻 Online",
    bots:    "🤖 Bots",
    boosts:  "💎 Boosts",
  };

  for (const name of Object.values(stats)) {
    if (!guild.channels.cache.find(c => c.parentId === category.id && c.name.startsWith(name))) {
      await guild.channels.create({
        name: `${name}: 0`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
      });
    }
  }

  async function updateStats() {
    const members = await guild.members.fetch();
    const online = members.filter(m => m.presence && m.presence.status !== "offline").size;
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.size - bots;
    const boosts = guild.premiumSubscriptionCount || 0;

    const channels = {
      members: guild.channels.cache.find(c => c.name.startsWith(stats.members)),
      online:  guild.channels.cache.find(c => c.name.startsWith(stats.online)),
      bots:    guild.channels.cache.find(c => c.name.startsWith(stats.bots)),
      boosts:  guild.channels.cache.find(c => c.name.startsWith(stats.boosts)),
    };

    if (channels.members) await channels.members.setName(`${stats.members}: ${humans}`);
    if (channels.online)  await channels.online.setName(`${stats.online}: ${online}`);
    if (channels.bots)    await channels.bots.setName(`${stats.bots}: ${bots}`);
    if (channels.boosts)  await channels.boosts.setName(`${stats.boosts}: ${boosts}`);
  }
  updateStats();
  setInterval(updateStats, 5 * 60 * 1000);

  // Offene Giveaways wieder aktivieren
  const giveaways = loadGiveaways();
  for (const g of giveaways.filter(x => !x.beendet)) {
    const rest = g.endZeit - Date.now();
    if (rest <= 0) endGiveaway(g.messageId).catch(() => {});
    else setTimeout(() => endGiveaway(g.messageId).catch(() => {}), rest);
  }
  console.log(`🎉 Reaktivierte Giveaways: ${giveaways.filter(x => !x.beendet).length}`);
});

// ============== WELCOME & BOOSTER ==============
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
/* ============== INTERACTIONS ============== */
client.on("interactionCreate", async (i) => {
  try {
    /* --- VERIFY --- */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Drücke unten auf **Verifizieren**, um Zugriff auf den Server zu erhalten!")
        .setImage(BANNER_URL);

      const btn = new ButtonBuilder().setCustomId("verify_button").setLabel("Verifizieren").setStyle(ButtonStyle.Success);
      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }
    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      if (i.member.roles.cache.has(role.id)) return i.reply({ content: "✅ Du bist bereits verifiziert!", ephemeral: true });
      await i.member.roles.add(role);
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
    }

    /* --- PAYPAL --- */
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

    /* --- TICKET PANEL (/panel) --- */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟 Support & Bewerbungen")
        .setDescription(
          `Bitte wähle unten die Art deines Tickets aus:\n\n` +
          `💰 **Shop Ticket** – Käufe & Bestellungen\n` +
          `🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n` +
          `✍️ **Kandar Bewerbung** – Allgemeine Bewerbung\n` +
          `🎨 **Designer Bewerbung** – Portfolio & Referenzen\n` +
          `✂️ **Cutter Bewerbung** – Software & Erfahrung\n` +
          `🛠️ **Highteam Anliegen** – Internes Anliegen\n` +
          `👥 **Support Anliegen** – Hilfe & Fragen`
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

    // Helper: Ticket-Control-Row
    const ticketControlsRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_close").setLabel("Schließen").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("ticket_lock").setLabel("Lock").setEmoji("🚫").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket_unlock").setLabel("Unlock").setEmoji("✅").setStyle(ButtonStyle.Secondary),
    );

    // Ticket-Auswahl
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // SHOP → Modal
      if (choice === "shop") {
        const modal = new ModalBuilder().setCustomId("shopTicketModal").setTitle("💰 Shop Ticket erstellen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("payment").setLabel("Zahlungsmethode").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("item").setLabel("Artikel / Produkt").setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(modal);
      }

      // STREAMER → Modal
      if (choice === "streamer") {
        const modal = new ModalBuilder().setCustomId("streamerTicketModal").setTitle("🎥 Streamer Bewerbung");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("follower").setLabel("Follower").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("avg_viewer").setLabel("Average Viewer").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("twitch_link").setLabel("Twitch-Link").setStyle(TextInputStyle.Short).setRequired(true)),
        );
        return i.showModal(modal);
      }

      // Rest → direkt Channel
      const map = {
        kandar:  { title: "✍️ Kandar Bewerbung",  cat: "✍️ Kandar Bewerbungen",  desc: "Bitte schreibe deine Bewerbung hier." },
        designer:{ title: "🎨 Designer Bewerbung", cat: "🎨 Designer Bewerbungen", desc: "Bitte sende dein Portfolio." },
        cutter:  { title: "✂️ Cutter Bewerbung",  cat: "✂️ Cutter Bewerbungen",  desc: "Bitte nenne Software & Erfahrung." },
        highteam:{ title: "🛠️ Highteam Ticket",   cat: "🛠️ Highteam Anliegen",   desc: "Beschreibe bitte dein Anliegen." },
        support: { title: "👥 Support Ticket",     cat: "👥 Support Tickets",     desc: "Bitte beschreibe dein Anliegen." },
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
      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControlsRow()] });
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
        .setDescription(`🧾 **Zahlung:** ${payment}\n📦 **Artikel:** ${item}`)
        .setFooter({ text: "Bitte beschreibe dein Anliegen genauer." });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControlsRow()] });
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
        .setFooter({ text: "Bitte warte auf eine Rückmeldung vom Team." });

      await ch.send({ content: `${i.user}`, embeds: [embed], components: [ticketControlsRow()] });
      return i.reply({ content: `✅ Streamer Bewerbung erstellt: ${ch}`, ephemeral: true });
    }

    /* --- TICKET CONTROLS --- */
    if (i.isButton() && ["ticket_close","ticket_lock","ticket_unlock"].includes(i.customId)) {
      const ch = i.channel;
      if (i.customId === "ticket_close") {
        await i.reply({ content: "🔒 Ticket wird geschlossen…" });
        await ch.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false }).catch(()=>{});
        setTimeout(() => ch.delete().catch(()=>{}), 1500);
      } else if (i.customId === "ticket_lock") {
        await ch.permissionOverwrites.edit(i.user.id, { SendMessages: false }).catch(()=>{});
        await i.reply({ content: "🚫 Ticket gesperrt." , ephemeral: true});
      } else if (i.customId === "ticket_unlock") {
        await ch.permissionOverwrites.edit(i.user.id, { SendMessages: true }).catch(()=>{});
        await i.reply({ content: "✅ Ticket entsperrt." , ephemeral: true});
      }
    }

    /* --- CREATOR ADD --- */
    if (i.isChatInputCommand() && i.commandName === "creator" && i.options.getSubcommand() === "add") {
      const modal = new ModalBuilder().setCustomId("creatorAddModal").setTitle("Creator hinzufügen");
      const fields = [
        { id: "title",     label: "Titel des Embeds",        req: true  },
        { id: "creatorId", label: "Discord-ID des Creators", req: true  },
        { id: "twitch",    label: "Twitch Link",             req: true  },
        { id: "youtube",   label: "YouTube Link (Optional)", req: false },
        { id: "tiktok",    label: "TikTok Link (Optional)",  req: false },
        { id: "instagram", label: "Instagram Link (Optional)", req:false},
        { id: "code",      label: "Creator Code (Optional)", req: false },
      ];
      modal.addComponents(fields.map(f =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(f.req)
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

      const embed = new EmbedBuilder().setColor("#9b5de5").setTitle(title).addFields({ name: "Twitch", value: twitch });
      if (youtube)   embed.addFields({ name: "YouTube", value: youtube });
      if (tiktok)    embed.addFields({ name: "TikTok", value: tiktok });
      if (instagram) embed.addFields({ name: "Instagram", value: instagram });
      if (code)      embed.addFields({ name: "Creator Code", value: code });

      const msg = await i.reply({ embeds: [embed], fetchReply: true });
      const arr = JSON.parse(fs.readFileSync(DATA_CREATORS, "utf8"));
      arr.push({ title, creatorId, twitch, youtube, tiktok, instagram, code, messageId: msg.id, channelId: msg.channel.id });
      fs.writeFileSync(DATA_CREATORS, JSON.stringify(arr, null, 2));
      return i.followUp({ content: "✅ Creator erstellt!", ephemeral: true });
    }

    /* --- NUKE --- */
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
        await ch.send("❌ Fehler (Hinweis: Nachrichten >14 Tage können nicht gelöscht werden).");
      }
    }

    /* --- GIVEAWAYS --- */
    if (i.isChatInputCommand() && i.commandName === "giveaway") {
      const preis = i.options.getString("preis");
      const dauerStr = i.options.getString("dauer");
      const gewinner = i.options.getInteger("gewinner");
      if (!gewinner || gewinner < 1) return i.reply({ content: "⚠️ Gewinneranzahl ungültig!", ephemeral: true });
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

      // Teilnehmerzahl im Embed aktualisieren
      const msg = i.message;
      const e0 = EmbedBuilder.from(msg.embeds[0]);
      const newDesc = e0.data.description.replace(/👥 \*\*Teilnehmer:\*\* \d+/, `👥 **Teilnehmer:** ${g.teilnehmer.length}`);
      e0.setDescription(newDesc);
      await msg.edit({ embeds: [e0] });

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

    /* --- TWITCH STREAM ANNOUNCE (/stream) --- */
    if (i.isChatInputCommand() && i.commandName === "stream") {
      const user = process.env.TWITCH_USERNAME || "deinchannel";
      const embed = new EmbedBuilder()
        .setColor("#9146FF")
        .setTitle(`🔴 ${user} ist jetzt LIVE!`)
        .setDescription(`Kommt vorbei und sagt hi! ✨\nhttps://twitch.tv/${user}`)
        .setImage(twitchPreview(user))
        .setFooter({ text: "Kandar Streaming" })
        .setTimestamp();
      return i.reply({ embeds: [embed] });
    }

    /* --- FINISH + FEEDBACK --- */
    if (i.isChatInputCommand() && i.commandName === "finish") {
      // Rollen-Check
      const allowed = (process.env.FINISH_ALLOWED_ROLE_IDS || "")
        .split(",").map(x => x.trim()).filter(Boolean);
      if (allowed.length && !i.member.roles.cache.some(r => allowed.includes(r.id))) {
        return i.reply({ content: "⛔ Dir fehlt die Berechtigung für /finish.", ephemeral: true });
      }

      const kunde = i.options.getUser("kunde");
      const customerRole = i.guild.roles.cache.get(process.env.CUSTOMER_ROLE_ID);
      if (customerRole) {
        const m = await i.guild.members.fetch(kunde.id).catch(()=>null);
        if (m && !m.roles.cache.has(customerRole.id)) await m.roles.add(customerRole).catch(()=>{});
      }

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🧾 Kauf abgeschlossen")
        .setDescription(`Vielen Dank ${kunde} für deinen Einkauf! ✅\n\nBitte gib uns Feedback – das hilft uns sehr! 💬⭐`)
        .setImage(BANNER_URL)
        .setFooter({ text: "Kandar • Vielen Dank!" })
        .setTimestamp();

      const fbBtn = new ButtonBuilder().setCustomId(`fb_start_${kunde.id}`).setLabel("Feedback geben").setEmoji("📝").setStyle(ButtonStyle.Primary);
      await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(fbBtn)] });
    }

    // Start Feedback → öffnet Modal (Sterne + Text), Verkäufer kommt danach als Dropdown
    if (i.isButton() && i.customId.startsWith("fb_start_")) {
      const modal = new ModalBuilder().setCustomId(`fb_modal_${i.customId.split("_")[2]}`).setTitle("Feedback abgeben");

      const stars = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("Sterne (1-5) ⭐")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const text = new TextInputBuilder()
        .setCustomId("text")
        .setLabel("Dein Feedback (kurz)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(stars), new ActionRowBuilder().addComponents(text));
      return i.showModal(modal);
    }

    // Nach Modal → Verkäufer per Dropdown auswählen (ohne ID-Suche)
    if (i.isModalSubmit() && i.customId.startsWith("fb_modal_")) {
      const targetUserId = i.customId.split("_")[2];
      const stars = Math.max(1, Math.min(5, parseInt(i.fields.getTextInputValue("stars")) || 1));
      const text = i.fields.getTextInputValue("text");

      // Verkäufer-Liste aus SELLER_ROLE_IDS sammeln
      const sellerRoleIds = (process.env.SELLER_ROLE_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
      const sellers = [];
      if (sellerRoleIds.length) {
        const ms = await i.guild.members.fetch();
        ms.forEach(m => {
          if (m.user.bot) return;
          if (m.roles.cache.some(r => sellerRoleIds.includes(r.id))) {
            sellers.push({ label: m.user.tag, value: m.id });
          }
        });
      }
      if (!sellers.length) {
        // Wenn keine Verkäufer gefunden → direkt senden ohne Verkäufer
        await finalizeFeedback(i, targetUserId, stars, text, null);
        return;
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`fb_pick_${targetUserId}_${stars}_${Buffer.from(text).toString("base64url").slice(0,900)}`)
        .setPlaceholder("Wähle den Verkäufer aus")
        .addOptions(sellers.slice(0,25)); // Discord max 25

      return i.reply({ content: "Bitte wähle den Verkäufer aus:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    // Verkäufer ausgewählt → Feedback finalisieren
    if (i.isStringSelectMenu() && i.customId.startsWith("fb_pick_")) {
      const [, , uid, starsB64, textB64] = i.customId.split("_");
      const stars = parseInt(starsB64);
      const text = Buffer.from(textB64 || "", "base64url").toString();
      const sellerId = i.values[0] || null;
      await finalizeFeedback(i, uid, stars, text, sellerId);
    }

  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
  }
});

/* ============== FEEDBACK FINALISIEREN ============== */
async function finalizeFeedback(i, targetUserId, stars, text, sellerId) {
  const fbChan = i.guild.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID);
  const starsStr = "⭐".repeat(stars) + (stars < 5 ? "☆".repeat(5 - stars) : "");

  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("📝 Neues Feedback eingegangen")
    .setDescription(
      `👤 **Kunde:** <@${targetUserId}>\n` +
      (sellerId ? `🧑‍💼 **Verkäufer:** <@${sellerId}>\n` : "") +
      `⭐ **Bewertung:** ${starsStr}\n\n` +
      `💬 **Feedback:**\n${text}\n\n` +
      `🎉 Danke fürs Feedback!`
    )
    .setImage(BANNER_URL)
    .setFooter({ text: "Kandar • Feedback" })
    .setTimestamp();

  if (fbChan) await fbChan.send({ embeds: [embed] });
  await i.reply({ content: "✅ Danke! Dein Feedback wurde gesendet.", ephemeral: true });
}

/* ============== GIVEAWAY ENDE (shared) ============== */
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

    const winners = Array.from({ length: g.gewinner }, () => `<@${g.teilnehmer[Math.floor(Math.random() * g.teilnehmer.length)]}>`);
    const e0 = EmbedBuilder.from(msg.embeds[0])
      .setColor("#9B5DE5")
      .setDescription(`**Preis:** ${g.preis}\n👥 **Teilnehmer:** ${g.teilnehmer.length}\n🏆 **Gewinner:** ${winners.join(", ")}`)
      .setFooter({ text: "Giveaway beendet" });
    await msg.edit({ embeds: [e0], components: [] });
    await ch.send(`🎉 Glückwunsch ${winners.join(", ")}! Ihr habt **${g.preis}** gewonnen!`);
    if (interaction) await interaction.reply({ content: "✅ Giveaway beendet!", ephemeral: true });
  } catch (err) {
    console.error("❌ Fehler beim Beenden des Giveaways:", err);
  }
}

/* ============== LOGGING ============== */
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

/* ============== LOGIN ============== */
client.login(process.env.DISCORD_TOKEN);
