import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import fs from 'fs';
import 'dotenv/config';

// ========================= Nuke Command =========================
export const nukeCommandData = new SlashCommandBuilder()
  .setName('nuke')
  .setDescription('Löscht alle Nachrichten im aktuellen Channel');

// ========================= Order Command =========================
export const orderCommandData = new SlashCommandBuilder()
  .setName('order')
  .setDescription('Erstellt oder verwaltet Bestellungen')
  .addStringOption(option =>
    option.setName('artikel')
      .setDescription('Gib den Artikel ein')
      .setRequired(true)
  );

// ========================= PayPal Command =========================
export const paypalCommandData = new SlashCommandBuilder()
  .setName('paypal')
  .setDescription('Erstellt einen PayPal-Zahlungslink')
  .addNumberOption(option =>
    option.setName('betrag')
      .setDescription('Betrag in Euro')
      .setRequired(true)
  );

// ========================= Verify Command =========================
export const verifyCommandData = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Zeigt das Regelwerk und gibt die Verifikationsrolle');

// ========================= Giveaway Command =========================
export const giveawayCommandData = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Erstellt, löscht oder rerollt Giveaways')
  .addStringOption(option =>
    option.setName('aktion')
      .setDescription('Erstelle, lösche oder reroll')
      .setRequired(true)
      .addChoices(
        { name: 'Erstellen', value: 'create' },
        { name: 'Löschen', value: 'delete' },
        { name: 'Reroll', value: 'reroll' }
      )
  )
  .addStringOption(option =>
    option.setName('zeit')
      .setDescription('Gib die Dauer an (z.B. 1d, 2h, 30m)')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('gewinner')
      .setDescription('Anzahl der Gewinner')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('preis')
      .setDescription('Preis des Giveaways')
      .setRequired(false)
  );

// ========================= COMMAND LOGIC =========================
export default (client) => {
  client.on('interactionCreate', async interaction => {
    try {

      // -------------------- /nuke --------------------
      if (interaction.isCommand() && interaction.commandName === 'nuke') {
        const allowedRoles = process.env.NUKE_ROLES?.split(',') || [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);

        if (!allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung!', ephemeral: true });
        }

        await interaction.reply({ content: '⚠️ Kanal wird geleert...', ephemeral: false });
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        await interaction.channel.bulkDelete(messages, true);
        await interaction.followUp({ content: '✅ Kanal erfolgreich geleert!', ephemeral: false });
        return;
      }

      // -------------------- /paypal --------------------
      if (interaction.isCommand() && interaction.commandName === 'paypal') {
        const allowedRoles = process.env.PAYPAL_ROLES?.split(',') || [];
        const memberRoles = interaction.member.roles.cache.map(r => r.id);

        if (allowedRoles.length && !allowedRoles.some(r => memberRoles.includes(r))) {
          return interaction.reply({ content: '❌ Du hast keine Berechtigung!', ephemeral: true });
        }

        const amount = interaction.options.getNumber('betrag');
        if (!amount || amount <= 0) return interaction.reply({ content: '⚠️ Bitte einen gültigen Betrag angeben!', ephemeral: true });

        const paypalLink = `https://www.paypal.com/paypalme/jonahborospreitzer/${amount}`;

        const embed = new EmbedBuilder()
          .setTitle('💰 PayPal Zahlung')
          .setDescription(`Klicke auf den Button, um **${amount}€** zu zahlen`)
          .setColor('#0099ff')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        const button = new ButtonBuilder()
          .setLabel(`Jetzt ${amount}€ zahlen`)
          .setStyle(ButtonStyle.Link)
          .setURL(paypalLink);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // -------------------- /verify --------------------
      if (interaction.isCommand() && interaction.commandName === 'verify') {
        const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
        const verifyRoleId = process.env.VERIFY_ROLE_ID;
        const channel = interaction.guild.channels.cache.get(verifyChannelId);
        if (!channel) return interaction.reply({ content: '❌ Verify Channel nicht gefunden!', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('📜 Regelwerk')
          .setDescription(
`§ 1: Umgang
Ein freundlicher und respektvoller Umgang ist jederzeit Pflicht!
§ 2: Anweisungen
Den Anweisungen von Teammitgliedern ist stets Folge zu leisten!
§ 3: Pingen
Das grundlose Taggen/Pingen/Markieren von Nutzern & Benutzerrängen ist untersagt!
§ 4: Leaking
Das Teilen/Leaken von personenbezogenen Daten ist verboten!
§ 5: Spam
Spamming jeglicher Form ist in sämtlichen Textchannels verboten!
§ 6: Channels
Das Senden von Sachen in die dafür nicht vorgesehenen Channel ist verboten!
§ 7: Das letzte Wort
Teammitglieder haben das letzte Wort!
§ 8: Beleidigungen
Extremes Beleidigen im Chat ist Strengstens verboten!
§ 10: Werbung
Werbung für andere Discord-Server ist in allen Text- und Voicechannels, sowie auch über DM verboten!
§ 11: NSFW-Inhalte
Das Verbreiten von Videos und Bildern, welche Tierquälerei und Blutinhalte zeigen, ist verboten!
§ 12: Drohung und Erpressung
Das Drohen und Erpressen von Usern, beispielsweise mit einem Leak ist verboten!
§ 13: Bots und Raids
Das Verwenden von Bot-Accounts und Durchführen von Raids ist verboten!
§ 14: Discord Rules
Auf diesem Server gelten auch die allgemeinen Discord ToS sowie Discord Community-Richtlinien!`
          )
          .setColor('#00FF00')
          .setFooter({ text: 'Kandar Community', iconURL: interaction.guild.iconURL({ dynamic: true }) });

        const button = new ButtonBuilder()
          .setCustomId('verify_role')
          .setLabel('✅ Verifizieren')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Verify-Nachricht gesendet!', ephemeral: true });
        return;
      }

      // -------------------- /order --------------------
      // Logik hier wird in order.js behandelt (Modular)
      if (interaction.isCommand() && interaction.commandName === 'order') return;

      // -------------------- /giveaway --------------------
      // Logik hier wird in giveaway.js behandelt (Modular)
      if (interaction.isCommand() && interaction.commandName === 'giveaway') return;

    } catch (error) {
      console.error('Error bei Commands:', error);
      if (!interaction.replied) await interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
    }
  });
};
