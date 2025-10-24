import { EmbedBuilder } from 'discord.js';

export default (client) => {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Prüfen, ob der Boost-Status geändert wurde
      const oldBoost = oldMember.premiumSince;
      const newBoost = newMember.premiumSince;

      // Wenn vorher nicht geboostet und jetzt geboostet
      if (!oldBoost && newBoost) {
        const boostChannelId = process.env.BOOST_CHANNEL_ID;
        const channel = newMember.guild.channels.cache.get(boostChannelId);
        if (!channel) return console.log('⚠️ Boost-Channel nicht gefunden!');

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🚀 Vielen Dank fürs Boosting!')
          .setDescription(`${newMember.user} hat den Server geboostet!`)
          .setFooter({ text: 'Kandar Community', iconURL: newMember.guild.iconURL({ dynamic: true }) })
          .setTimestamp();

        channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Boost Event Error:', err);
    }
  });
};
