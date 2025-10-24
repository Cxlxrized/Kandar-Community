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
  StringSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from "discord.js";
import "dotenv/config";
import fs from "fs";

// === Client erstellen ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// === Commands ===
const commands = [
  new SlashCommandBuilder()
    .setName("paypal")
    .setDescription("Erstellt einen PayPal-Zahlungslink")
    .addNumberOption((o) =>
      o.setName("betrag").setDescription("Betrag in Euro").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("order")
    .setDescription("Erstellt eine Bestellung")
    .addStringOption((o) =>
      o.setName("artikel").setDescription("Artikelname").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketmsg")
    .setDescription("Sendet das Ticket-Auswahlpanel"),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Sendet das Regelwerk & den Verify-Button"),

  new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator-System")
    .addSubcommand((sc) =>
      sc.setName("add").setDescription("Creator hinzufügen")
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("Zeigt alle Creator")
    ),

  new SlashCommandBuilder()
    .setName("finish")
    .setDescription("Kauf abschließen & Feedback abfragen")
    .addUserOption((o) =>
      o.setName("kunde").setDescription("Kunde").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription(
      "Löscht viele Nachrichten im aktuellen Channel (nur mit Berechtigung)"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map((c) => c.toJSON());

// === Commands registrieren ===
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log("🔄 Registriere Commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Commands registriert!");
  } catch (err) {
    console.error("❌ Fehler beim Registrieren:", err);
  }
})();

// === Ready ===
client.once("ready", () =>
  console.log(`🤖 Bot online als ${client.user.tag}`)
);

// === WELCOME & BOOSTER SYSTEM ===
client.on("guildMemberAdd", async (member) => {
  const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
  const channel = member.guild.channels.cache.get(welcomeChannelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Willkommen auf dem Server!")
    .setDescription(`Willkommen ${member}, schön, dass du dabei bist! 🎉`)
    .setImage(
      "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif"
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// Booster-Event
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.premiumSince === newMember.premiumSince) return;
  if (!newMember.premiumSince) return; // Kein neuer Boost
  const boosterChannelId = process.env.BOOSTER_CHANNEL_ID;
  const channel = newMember.guild.channels.cache.get(boosterChannelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("💎 Neuer Server-Boost!")
    .setDescription(`Vielen Dank ${newMember} fürs Boosten des Servers! 🚀💖`)
    .setImage(
      "https://cdn.discordapp.com/attachments/1413564981777141981/1431085432690704495/kandar_banner.gif"
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// === INTERACTIONS ===
client.on("interactionCreate", async (interaction) => {
  try {
    // === PAYPAL ===
    if (interaction.isChatInputCommand() && interaction.commandName === "paypal") {
      const amount = interaction.options.getNumber("betrag");
      if (!amount || amount <= 0)
        return interaction.reply({
          content: "⚠️ Bitte einen gültigen Betrag eingeben!",
          flags: 64,
        });

      const link = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("💰 PayPal Zahlung")
        .setDescription(`Klicke unten, um **${amount}€** zu zahlen.`)
        .setFooter({ text: "Kandar Community" });

      const button = new ButtonBuilder()
        .setLabel(`Jetzt ${amount}€ zahlen`)
        .setStyle(ButtonStyle.Link)
        .setURL(link);

      await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
      });
      return;
    }

    // === FINISH ===
    if (interaction.isChatInputCommand() && interaction.commandName === "finish") {
      const kunde = interaction.options.getUser("kunde");
      const embed = new EmbedBuilder()
        .setColor("#00FF88")
        .setTitle("🧾 Bestellung abschließen")
        .setDescription(`${kunde}, bitte gib dein Feedback ab! ⭐`);

      const btn = new ButtonBuilder()
        .setCustomId(`feedback_${kunde.id}`)
        .setLabel("⭐ Feedback geben")
        .setStyle(ButtonStyle.Primary);

      await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("feedback_")) {
      const kundeId = interaction.customId.split("feedback_")[1];
      if (interaction.user.id !== kundeId)
        return interaction.reply({
          content: "❌ Dieses Feedback ist nicht für dich bestimmt.",
          flags: 64,
        });

      const modal = new ModalBuilder()
        .setCustomId(`feedbackModal_${kundeId}`)
        .setTitle("Feedback abgeben");

      const fbText = new TextInputBuilder()
        .setCustomId("fb_text")
        .setLabel("Dein Feedback")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(fbText));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("feedbackModal_")) {
      const kundeId = interaction.customId.split("feedbackModal_")[1];
      const feedback = interaction.fields.getTextInputValue("fb_text");

      const guild = interaction.guild;
      const member = await guild.members.fetch(kundeId).catch(() => null);
      const customerRoleId = process.env.CUSTOMER_ROLE_ID;
      if (member && customerRoleId) {
        const role = guild.roles.cache.get(customerRoleId);
        if (role) await member.roles.add(role).catch(() => {});
      }

      const logChannel = guild.channels.cache.get(process.env.FEEDBACK_LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor("#FFD166")
          .setTitle("📝 Neues Feedback erhalten")
          .addFields(
            { name: "Von", value: `<@${kundeId}>`, inline: true },
            { name: "Feedback", value: feedback || "-" }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }

      await interaction.reply({ content: "✅ Danke für dein Feedback!", flags: 64 });
      return;
    }

    // === NUKE ===
    if (interaction.isChatInputCommand() && interaction.commandName === "nuke") {
      const allowedRoles = process.env.NUKE_ROLES
        ? process.env.NUKE_ROLES.split(",")
        : [];
      const memberRoles = interaction.member.roles.cache.map((r) => r.id);

      if (allowedRoles.length && !allowedRoles.some((r) => memberRoles.includes(r))) {
        return interaction.reply({
          content: "❌ Du hast keine Berechtigung für /nuke.",
          flags: 64,
        });
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm_nuke")
          .setLabel("✅ Bestätigen")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("cancel_nuke")
          .setLabel("❌ Abbrechen")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: "⚠️ Bist du sicher, dass du diesen Channel leeren möchtest?",
        components: [confirmRow],
        flags: 64,
      });
      return;
    }

    if (
      interaction.isButton() &&
      (interaction.customId === "confirm_nuke" ||
        interaction.customId === "cancel_nuke")
    ) {
      if (interaction.customId === "cancel_nuke") {
        return interaction.update({ content: "❌ Nuke abgebrochen.", components: [] });
      }

      await interaction.update({ content: "💣 Leere Channel...", components: [] });
      const channel = interaction.channel;

      try {
        let fetched;
        do {
          fetched = await channel.messages.fetch({ limit: 100 });
          if (fetched.size > 0) await channel.bulkDelete(fetched, true);
        } while (fetched.size >= 2);

        await channel.send(`✅ Channel wurde von ${interaction.user} geleert.`);
      } catch (e) {
        console.error("Nuke Error:", e);
        await channel.send(
          "❌ Fehler: Nachrichten älter als 14 Tage können nicht gelöscht werden."
        );
      }
      return;
    }
  } catch (err) {
    console.error("❌ Interaktionsfehler:", err);
    if (!interaction.replied)
      await interaction.reply({
        content: "❌ Es ist ein Fehler aufgetreten!",
        flags: 64,
      });
  }
});

// === LOGGING SYSTEM (6 Arten) ===

// Member Logs
client.on("guildMemberAdd", (member) => {
  const log = member.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("👋 Mitglied beigetreten")
    .setDescription(`${member} ist dem Server beigetreten.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on("guildMemberRemove", (member) => {
  const log = member.guild.channels.cache.get(process.env.MEMBER_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("👋 Mitglied hat den Server verlassen")
    .setDescription(`${member.user.tag} hat den Server verlassen.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// Message Logs
client.on("messageDelete", (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const log = msg.guild.channels.cache.get(process.env.MESSAGE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🗑️ Nachricht gelöscht")
    .addFields(
      { name: "Autor", value: `${msg.author}` },
      { name: "Channel", value: `${msg.channel}` },
      { name: "Inhalt", value: msg.content || "[Embed/Anhang]" }
    )
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// Channel Logs
client.on("channelCreate", (channel) => {
  const log = channel.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("📢 Channel erstellt")
    .setDescription(`**${channel.name}** (${channel.type}) wurde erstellt.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on("channelDelete", (channel) => {
  const log = channel.guild.channels.cache.get(process.env.CHANNEL_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🗑️ Channel gelöscht")
    .setDescription(`**${channel.name}** wurde gelöscht.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// Role Logs
client.on("roleCreate", (role) => {
  const log = role.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle("🧩 Rolle erstellt")
    .setDescription(`Rolle **${role.name}** wurde erstellt.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

client.on("roleDelete", (role) => {
  const log = role.guild.channels.cache.get(process.env.ROLE_LOGS_CHANNEL_ID);
  if (!log) return;
  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🧩 Rolle gelöscht")
    .setDescription(`Rolle **${role.name}** wurde gelöscht.`)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// Server Logs
client.on("guildUpdate", (oldGuild, newGuild) => {
  const log = newGuild.channels.cache.get(process.env.SERVER_LOGS_CHANNEL_ID);
  if (!log) return;
  const changes = [];
  if (oldGuild.name !== newGuild.name)
    changes.push(`📛 Name geändert: **${oldGuild.name} → ${newGuild.name}**`);
  if (oldGuild.icon !== newGuild.icon) changes.push(`🖼️ Servericon geändert`);
  if (changes.length === 0) return;
  const embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("⚙️ Server geändert")
    .setDescription(changes.join("\n"))
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// Voice Logs
client.on("voiceStateUpdate", (oldState, newState) => {
  const log = newState.guild.channels.cache.get(process.env.VOICE_LOGS_CHANNEL_ID);
  if (!log) return;

  const user = newState.member.user;
  let desc = "";

  if (!oldState.channel && newState.channel)
    desc = `🎙️ ${user} ist **${newState.channel.name}** beigetreten.`;
  else if (oldState.channel && !newState.channel)
    desc = `🔇 ${user} hat **${oldState.channel.name}** verlassen.`;
  else if (oldState.channelId !== newState.channelId)
    desc = `🔁 ${user} wechselte von **${oldState.channel.name}** zu **${newState.channel.name}**.`;

  if (!desc) return;
  const embed = new EmbedBuilder()
    .setColor("#00A8FF")
    .setTitle("🔊 Voice Aktivität")
    .setDescription(desc)
    .setTimestamp();
  log.send({ embeds: [embed] });
});

// === LOGIN ===
client.login(process.env.DISCORD_TOKEN);
