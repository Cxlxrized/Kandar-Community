import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

const activeGiveaways = new Map(); // Aktive Giveaways

export default (client) => {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName !== 'giveaway') return;

    const subcommand = interaction.options.getSubcommand();

    // --- START GIVEAWAY ---
    if (subcommand === 'start') {
      const channel = interaction.options.getChannel('channel');
      const prize = interaction.options.getString('preis');
      const days = interaction.options.getInteger('tage') || 0;
      const hours = interaction.options.getInteger('stunden') || 0;
      const minutes = interaction.options.getInteger('minuten') || 0;

      const durationMs = ((days*24*60 + hours*60 + minutes) * 60 * 1000);
      if (!channel || !prize || durationMs <= 0) {
        return interaction.reply({ content: '⚠️ Bitte alle Optionen korrekt ausfüllen (mindestens 1 Minute)!', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎉 **Neues Giveaway!** 🎉')
        .setColor('#FFD700')
        .setDescription(`**Preis:** ${prize}\n**Dauer:** ${days}d ${hours}h ${minutes}m`)
        .addFields(
          { name: 'Wie teilnehmen?', value: 'Klicke auf den Button unten, um teilzunehmen!', inline: false },
          { name: 'Gestartet von', value: `${interaction.user}`, inline: true },
          { name: 'Teilnehmer', value: '0', inline: true }
        )
        .setFooter({ text: 'Viel Glück allen Teilnehmern!', iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      const enterButton = new ButtonBuilder()
        .setCustomId('enter_giveaway')
        .setLabel('🎉 Teilnehmen')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(enterButton);

      const giveawayMessage = await channel.send({ embeds: [embed], components: [row] });

      const participants = new Set();
      activeGiveaways.set(giveawayMessage.id, { prize, participants });

      await interaction.reply({ content: `✅ Giveaway gestartet in ${channel}!`, ephemeral: true });

      const collector = giveawayMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: durationMs
      });

      collector.on('collect', async i => {
        if (i.customId === 'enter_giveaway') {
          participants.add(i.user.id);
          const newEmbed = EmbedBuilder.from(giveawayMessage.embeds[0])
            .spliceFields(2, 1, { name: 'Teilnehmer', value: `${participants.size}`, inline: true });
          await giveawayMessage.edit({ embeds: [newEmbed] });
          await i.reply({ content: '✅ Du bist jetzt im Giveaway!', ephemeral: true });
        }
      });

      collector.on('end', async () => {
        if (participants.size === 0) {
          return channel.send('❌ Niemand hat am Giveaway teilgenommen!');
        }
        const winnerId = Array.from(participants)[Math.floor(Math.random() * participants.size)];
        const winner = await interaction.guild.members.fetch(winnerId);

        const endEmbed = EmbedBuilder.from(giveawayMessage.embeds[0])
          .setTitle('🎊 **Giveaway beendet!** 🎊')
          .setDescription(`Der Gewinner von **${prize}** ist: ${winner}`)
          .setColor('#00FF00')
          .setFooter({ text: 'Glückwunsch an den Gewinner!' });

        await giveawayMessage.edit({ embeds: [endEmbed], components: [] });
        channel.send(`🎉 Herzlichen Glückwunsch ${winner}! Du hast **${prize}** gewonnen!`);
        activeGiveaways.delete(giveawayMessage.id);
      });
    }

    // --- END GIVEAWAY ---
    if (subcommand === 'end') {
      const messageId = interaction.options.getString('messageid');
      const giveawayData = activeGiveaways.get(messageId);
      if (!giveawayData) return interaction.reply({ content: '❌ Giveaway nicht gefunden!', ephemeral: true });

      const channel = interaction.channel;
      const winnerId = Array.from(giveawayData.participants)[Math.floor(Math.random() * giveawayData.participants.size)];
      const winner = await interaction.guild.members.fetch(winnerId);

      const embed = new EmbedBuilder()
        .setTitle('🎊 **Giveaway vorzeitig beendet!** 🎊')
        .setDescription(`Der Gewinner von **${giveawayData.prize}** ist: ${winner}`)
        .setColor('#00FF00');

      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [embed], components: [] });

      activeGiveaways.delete(messageId);
      interaction.reply({ content: `✅ Giveaway beendet! Gewinner: ${winner}`, ephemeral: false });
    }

    // --- REROLL GIVEAWAY ---
    if (subcommand === 'reroll') {
      const messageId = interaction.options.getString('messageid');
      const giveawayData = activeGiveaways.get(messageId);
      if (!giveawayData || giveawayData.participants.size === 0) {
        return interaction.reply({ content: '❌ Giveaway nicht gefunden oder keine Teilnehmer!', ephemeral: true });
      }

      const winnerId = Array.from(giveawayData.participants)[Math.floor(Math.random() * giveawayData.participants.size)];
      const winner = await interaction.guild.members.fetch(winnerId);

      const channel = interaction.channel;
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setDescription(`Der neue Gewinner von **${giveawayData.prize}** ist: ${winner}`);
        await msg.edit({ embeds: [embed] });
      }

      interaction.reply({ content: `🔄 Giveaway neu ausgelost! Gewinner: ${winner}`, ephemeral: false });
    }
  });
};
