// nuke.js
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default (client) => {
  // Event-Handler
  client.on('interactionCreate', async (interaction) => {
    try {
      // --- Slash Command: /nuke ---
      if (interaction.isChatInputCommand() && interaction.commandName === 'nuke') {
        const allowedRoles = process.env.NUKE_ROLES ? process.env.NUKE_ROLES.split(',') : [];
        const memberRoles = interaction.member?.roles?.cache?.map(r => r.id) || [];

        if (allowedRoles.length && !memberRoles.some(rid => allowedRoles.includes(rid))) {
          // ephemeral mit flags (64) — reduziert Deprecation-Warnung
          return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Command.', flags: 64 });
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) {
          return interaction.reply({ content: '❌ Dieser Channel unterstützt das Löschen nicht.', flags: 64 });
        }

        // Bestätigungs-Buttons (ephemeral)
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('nuke_confirm')
            .setLabel('✅ Bestätigen')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('nuke_cancel')
            .setLabel('❌ Abbrechen')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content: '⚠️ Bist du sicher, dass du diesen Channel vollständig löschen (nuken) möchtest? Dies entfernt viele Nachrichten (ältere als 14 Tage können nicht gelöscht werden).',
          components: [row],
          flags: 64
        });

        return;
      }

      // --- Button: Abbruch ---
      if (interaction.isButton() && interaction.customId === 'nuke_cancel') {
        // Update die ephemeral Confirm-Nachricht (acknowledge + remove buttons)
        return interaction.update({ content: '❌ Nuke abgebrochen.', components: [] });
      }

      // --- Button: Bestätigen ---
      if (interaction.isButton() && interaction.customId === 'nuke_confirm') {
        const allowedRoles = process.env.NUKE_ROLES ? process.env.NUKE_ROLES.split(',') : [];
        const memberRoles = interaction.member?.roles?.cache?.map(r => r.id) || [];

        if (allowedRoles.length && !memberRoles.some(rid => allowedRoles.includes(rid))) {
          // Sicherheit: nochmal prüfen
          return interaction.update({ content: '❌ Du hast keine Berechtigung, diesen Command auszuführen.', components: [] });
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) {
          return interaction.update({ content: '❌ Dieser Channel unterstützt das Löschen nicht.', components: [] });
        }

        // acknowledge the button interaction and remove buttons immediately
        await interaction.update({ content: '⏳ Nuking... Bitte einen Moment Geduld.', components: [] });

        // Jetzt die Löscharbeit asynchron ausführen
        try {
          // Bulk-delete in Schleifen; ältere (älter als 14 Tage) Nachrichten werden von Discord ignoriert
          let fetched;
          do {
            fetched = await channel.messages.fetch({ limit: 100 });
            if (fetched.size === 0) break;
            // bulkDelete ignoriert Nachrichten älter 14 Tage automatisch; catch vermeiden
            await channel.bulkDelete(fetched, true);
            // kleiner Delay kann helfen, Rate-Limits zu vermeiden
            await new Promise(res => setTimeout(res, 500));
          } while (fetched.size >= 2);

          // Erfolgsmeldung öffentlich im Channel
          await channel.send(`✅ Channel wurde von **${interaction.user.tag}** nuked (Nachrichten gelöscht).`);
        } catch (err) {
          console.error('Fehler beim Nuking:', err);
          // Wenn etwas schief läuft, sende eine FollowUp (ephemeral) um Nutzer zu informieren
          try {
            await interaction.followUp({ content: '❌ Fehler beim Löschen des Channels. Siehe Logs.', flags: 64 });
          } catch (e) {
            console.error('Fehler beim Senden der Fehlermeldung:', e);
          }
        }

        return;
      }

    } catch (err) {
      console.error('Nuke Interaction Error:', err);
      // Falls Interaction noch nicht geacknowledged ist, antworte; sonst followUp
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: '❌ Ein Fehler ist aufgetreten.', flags: 64 });
        } else {
          await interaction.reply({ content: '❌ Ein Fehler ist aufgetreten.', flags: 64 });
        }
      } catch (e) {
        console.error('Fehler beim Error-Reply:', e);
      }
    }
  });

  // --- Slash-Command registrieren (Guild) beim ready-Event ---
  client.once('ready', async () => {
    try {
      const data = new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Löscht viele Nachrichten im aktuellen Channel (nur bestimmte Rollen)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

      if (!process.env.GUILD_ID) {
        console.log('WARN: GUILD_ID nicht gesetzt — /nuke nicht als Guild-Command registriert.');
        return;
      }

      await client.application.commands.create(data.toJSON(), process.env.GUILD_ID);
      console.log('✅ /nuke Command registriert.');
    } catch (err) {
      console.error('Fehler beim Registrieren des /nuke Commands:', err);
    }
  });
};

