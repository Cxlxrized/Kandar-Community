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
import http from "http";
import "dotenv/config";

/* ===========================
   CLIENT INITIALISIERUNG
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

/* ===========================
   DATENORDNER
=========================== */
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const GIVEAWAY_FILE = "./data/giveaways.json";
if (!fs.existsSync(GIVEAWAY_FILE)) fs.writeFileSync(GIVEAWAY_FILE, "[]");

/* ===========================
   SLASH COMMANDS 
=========================== */
const commands = [
  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Sendet die Verify-Nachricht"),

  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption(o =>
      o.setName("betrag").setDescription("Betrag in Euro (z. B. 12.99)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt eine Bestellung")
    .addUserOption(o => o.setName("kunde").setDescription("Kunde").setRequired(true))
    .addStringOption(o => o.setName("artikel").setDescription("Artikel").setRequired(true))
    .addNumberOption(o => o.setName("preis").setDescription("Preis (in Euro)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Löscht alle Nachrichten im Channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());

/* ===========================
   COMMANDS REGISTRIEREN
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
   READY EVENT
=========================== */
client.once("ready", () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
});

/* ===========================
   INTERAKTIONEN
=========================== */
client.on("interactionCreate", async (i) => {
  try {
    /* ===== VERIFY ===== */
    if (i.isChatInputCommand() && i.commandName === "verifymsg") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Verifizierung")
        .setDescription("Klicke auf **Verifizieren**, um Zugriff auf den Server zu erhalten.")
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");

      const button = new ButtonBuilder()
        .setCustomId("verify_button")
        .setLabel("Verifizieren")
        .setStyle(ButtonStyle.Success);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
    }

    if (i.isButton() && i.customId === "verify_button") {
      const role = i.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
      if (!role) return i.reply({ content: "❌ Verify-Rolle nicht gefunden!", ephemeral: true });
      await i.member.roles.add(role).catch(() => {});
      return i.reply({ content: "🎉 Du bist jetzt verifiziert!", ephemeral: true });
    }

    /* ===== PAYPAL ===== */
    if (i.isChatInputCommand() && i.commandName === "paypal") {
      const amount = i.options.getNumber("betrag").toFixed(2);
      const link = `https://www.paypal.com/paypalme/${process.env.PAYPAL_ME_NAME}/${amount}`;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke auf den Button, um **${amount}€** zu zahlen.`)
        .setFooter({ text: "Kandar Shop" });

      const btn = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(link);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
    }

    /* ===== ORDER SYSTEM ===== */
    if (i.isChatInputCommand() && i.commandName === "order") {
      const kunde = i.options.getUser("kunde");
      const artikel = i.options.getString("artikel");
      const preis = i.options.getNumber("preis");

      const embed = new EmbedBuilder()
        .setColor("#ffaa00")
        .setTitle(`🛒 Bestellung von ${kunde.username}`)
        .setDescription(`📦 **Artikel:** ${artikel}\n💶 **Preis:** ${preis.toFixed(2)}€`)
        .setFooter({ text: "Kandar Shop" })
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif");

      const add = new ButtonBuilder().setCustomId("order_add").setLabel("➕ Artikel hinzufügen").setStyle(ButtonStyle.Primary);
      const remove = new ButtonBuilder().setCustomId("order_remove").setLabel("➖ Artikel entfernen").setStyle(ButtonStyle.Secondary);
      const finish = new ButtonBuilder().setCustomId("order_finish").setLabel("✅ Bestellung abschließen").setStyle(ButtonStyle.Success);

      await i.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(add, remove, finish)]
      });
    }

    // --- Modal zum Hinzufügen ---
    if (i.isButton() && i.customId === "order_add") {
      const modal = new ModalBuilder()
        .setCustomId("addItem")
        .setTitle("➕ Artikel hinzufügen");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("artikel").setLabel("Artikelname").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("preis").setLabel("Preis (€)").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      return i.showModal(modal);
    }

    // --- Modal Artikel entfernen ---
    if (i.isButton() && i.customId === "order_remove") {
      const modal = new ModalBuilder()
        .setCustomId("removeItem")
        .setTitle("➖ Artikel entfernen");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("artikel").setLabel("Artikelname zum Entfernen").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      return i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === "addItem") {
      const artikel = i.fields.getTextInputValue("artikel");
      const preis = parseFloat(i.fields.getTextInputValue("preis"));
      const embed = EmbedBuilder.from(i.message.embeds[0]);

      embed.setDescription(embed.data.description + `\n📦 **+ ${artikel}** – 💶 ${preis.toFixed(2)}€`);
      await i.message.edit({ embeds: [embed] });
      return i.reply({ content: "✅ Artikel hinzugefügt!", ephemeral: true });
    }

    if (i.isModalSubmit() && i.customId === "removeItem") {
      const artikel = i.fields.getTextInputValue("artikel");
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const newDesc = embed.data.description
        .split("\n")
        .filter(line => !line.includes(artikel))
        .join("\n");
      embed.setDescription(newDesc);
      await i.message.edit({ embeds: [embed] });
      return i.reply({ content: "✅ Artikel entfernt!", ephemeral: true });
    }

    if (i.isButton() && i.customId === "order_finish") {
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      embed.setTitle("✅ Bestellung abgeschlossen");
      await i.message.edit({ embeds: [embed], components: [] });
      return i.reply({ content: "✅ Bestellung erfolgreich abgeschlossen!", ephemeral: true });
    }

    /* ===== NUKE ===== */
    if (i.isChatInputCommand() && i.commandName === "nuke") {
      const ch = i.channel;
      await i.reply({ content: "⚠️ Channel wird geleert...", ephemeral: true });
      let msgs;
      do {
        msgs = await ch.messages.fetch({ limit: 100 });
        await ch.bulkDelete(msgs, true);
      } while (msgs.size >= 2);
      await ch.send("✅ Channel erfolgreich geleert!");
    }

  } catch (err) {
    console.error("❌ Fehler:", err);
  }
});
/* ===========================
   TICKET SYSTEM MIT CLOSE-BUTTON
=========================== */

const TEAM_ROLE_IDS = process.env.TEAM_ROLE_IDS
  ? process.env.TEAM_ROLE_IDS.split(",").map(id => id.trim())
  : [];

client.on("interactionCreate", async (i) => {
  try {
    /* ==== /panel ==== */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎟️ Support & Bewerbungen")
        .setDescription(
          "Bitte wähle unten, welche Art von Ticket du öffnen möchtest:\n\n" +
          "💰 **Shop Ticket** – Käufe & Bestellungen\n" +
          "🎥 **Streamer Bewerbung** – Bewirb dich als Creator\n" +
          "✍️ **Allgemeine Bewerbung** – Für Team-Positionen\n" +
          "👥 **Support Ticket** – Allgemeine Hilfe\n"
        )
        .setImage("https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif")
        .setFooter({ text: "Kandar Support System" });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Wähle Ticket-Typ …")
        .addOptions([
          { label: "Shop Ticket", value: "shop", emoji: "💰" },
          { label: "Streamer Bewerbung", value: "streamer", emoji: "🎥" },
          { label: "Allgemeine Bewerbung", value: "bewerbung", emoji: "✍️" },
          { label: "Support Ticket", value: "support", emoji: "👥" },
        ]);

      return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    /* ==== Auswahl im Panel ==== */
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const type = i.values[0];
      const guild = i.guild;
      const catName = "🎫 Tickets";
      let category = guild.channels.cache.find(
        c => c.name === catName && c.type === ChannelType.GuildCategory
      );
      if (!category)
        category = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });

      const ch = await guild.channels.create({
        name: `${type}-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...TEAM_ROLE_IDS.map(rid => ({ id: rid, allow: [PermissionFlagsBits.ViewChannel] })),
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle(`🎟️ Ticket: ${type}`)
        .setDescription("Ein Team-Mitglied wird sich bald um dich kümmern.\nBitte beschreibe dein Anliegen so genau wie möglich.")
        .setFooter({ text: "Kandar Support" })
        .setTimestamp();

      const closeBtn = new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("🔒 Ticket schließen")
        .setStyle(ButtonStyle.Danger);

      await ch.send({
        content: `${i.user}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(closeBtn)],
      });

      return i.reply({ content: `✅ Ticket erstellt: ${ch}`, ephemeral: true });
    }

    /* ==== Close-Button ==== */
    if (i.isButton() && i.customId === "ticket_close") {
      if (!i.member.roles.cache.some(r => TEAM_ROLE_IDS.includes(r.id))) {
        return i.reply({ content: "🚫 Nur Team-Mitglieder dürfen Tickets schließen!", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_close_reason")
        .setTitle("🔒 Ticket schließen");

      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Grund des Schließens")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reason));
      return i.showModal(modal);
    }

    /* ==== Modal: Close Reason ==== */
    if (i.isModalSubmit() && i.customId === "ticket_close_reason") {
      const reason = i.fields.getTextInputValue("reason");
      const ch = i.channel;

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🔒 Ticket geschlossen")
        .setDescription(`**Geschlossen von:** ${i.user}\n**Grund:** ${reason}`)
        .setFooter({ text: "Kandar Support" })
        .setTimestamp();

      await ch.send({ embeds: [embed] });
      await i.reply({ content: "✅ Ticket wurde geschlossen.", ephemeral: true });

      setTimeout(() => ch.delete().catch(() => {}), 5000);
    }
  } catch (err) {
    console.error("❌ Fehler im Ticket-System:", err);
  }
});

/* ===========================
   WEB SERVER für Railway (Keep Alive)
=========================== */
http.createServer((req, res) => res.end("✅ Bot läuft auf Railway")).listen(8080);

/* ===========================
   LOGIN
=========================== */
client.login(process.env.DISCORD_TOKEN);
