import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default (client) => {
  client.on('interactionCreate', async interaction => {
    try {
      // --- Button Interaction ---
      if (interaction.isButton() && interaction.customId === 'verify_button') {
        const role = interaction.guild.roles.cache.get(process.env.VERIFY_ROLE_ID);
        if (!role) return interaction.reply({ content: '❌ Rolle nicht gefunden!', ephemeral: true });

        await interaction.member.roles.add(role).catch(err => console.error('Fehler beim Rollen vergeben:', err));
        return interaction.reply({ content: `✅ Du hast die Rolle **${role.name}** erhalten!`, ephemeral: true });
      }

      // --- /verify Command ---
      if (interaction.isCommand() && interaction.commandName === 'verify') {
        const channelId = process.env.VERIFY_CHANNEL_ID;
        if (!channelId) return console.error('❌ VERIFY_CHANNEL_ID ist nicht gesetzt!');
        const channel = await client.channels.fetch(channelId);
        if (!channel) return interaction.reply({ content: '❌ Channel nicht gefunden!', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle(process.env.VERIFY_EMBED_TITLE || 'Regelwerk')
          .setDescription(
            '§ 1: Umgang\nEin freundlicher und respektvoller Umgang ist jederzeit Pflicht!\n' +
            '§ 2: Anweisungen\nDen Anweisungen von Teammitgliedern ist stets Folge zu leisten!\n' +
            '§ 3: Pingen\nDas grundlose Taggen/Pingen/Markieren von Nutzern & Benutzerrängen ist untersagt!\n' +
            '§ 4: Leaking\nDas Teilen/Leaken von personenbezogenen Daten ist verboten!\n' +
            '§ 5: Spam\nSpamming jeglicher Form ist in sämtlichen Textchannels verboten!\n' +
            '§ 6: Channels\nDas Senden von Sachen in die dafür nicht vorgesehenen Channel ist verboten!\n' +
            '§ 7: Das letzte Wort\nTeammitglieder haben das letzte Wort!\n' +
            '§ 8: Beleidigungen\nExtremes Beleidigen im Chat ist strengstens verboten!\n' +
            '§ 10: Werbung\nWerbung für andere Discord-Server ist in allen Text- und Voicechannels, sowie auch über DM verboten!\n' +
            '§ 11: NSFW-Inhalte\nDas Verbreiten von Videos und Bildern, welche Tierquälerei und Blutinhalte zeigen, ist verboten!\n' +
            '§ 12: Drohung und Erpressung\nDas Drohen und Erpressen von Usern, beispielsweise mit einem Leak ist verboten!\n' +
            '§ 13: Bots und Raids\nDas Verwenden von Bot-Accounts und Durchführen von Raids ist verboten!\n' +
            '§ 14: Discord Rules\nAuf diesem Server gelten auch die allgemeinen Discord ToS sowie Discord Community-Richtlinien!'
          )
          .setColor('#00AAFF');

        const button = new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel(process.env.VERIFY_BUTTON_LABEL || 'Ich akzeptiere die Regeln')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Regelwerk wurde gepostet!', ephemeral: true });
      }

    } catch (err) {
      console.error('Verify Modul Error:', err);
      if (!interaction.replied) interaction.reply({ content: '❌ Es ist ein Fehler aufgetreten!', ephemeral: true });
    }
  });
};
